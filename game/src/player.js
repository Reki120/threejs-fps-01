// player.js — the human fighter: acceleration movement, crouch, jump,
// AABB map collision, firing with recoil/spread, reload, plant/defuse
// channels and the viewmodel. One fixed-step update per tick.
import { clamp, TEAM_LANTERN } from './state.js';
import { WEAPONS, currentWeapon } from './weapons.js';
import { hitscan, aimDir, throwGrenade } from './combat.js';

const EYE_STAND = 1.62, EYE_CROUCH = 1.05;
const RADIUS = 0.36;
const WALK_SPEED = 5.4, CROUCH_SPEED = 2.6, AIR_CONTROL = 0.35;
const ACCEL = 42, FRICTION = 11, GRAVITY = 22, JUMP_VEL = 7.2;

export function createPlayer(name) {
  return {
    isPlayer: true, id: 'you', name, team: TEAM_LANTERN,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, hp: 100, alive: true,
    crouch: false, onGround: true,
    loadout: null, // set by main at round start
    fireCooldown: 0, reloadUntil: 0, reloading: false,
    spreadBloom: 0, recoilPitch: 0,
    lastShot: -9, stepPhase: 0, planting: false, defusing: false,
    viewKick: 0, // viewmodel kick 0..1, decays
  };
}

function collides(world, x, y, z, height) {
  for (const b of world.colliders) {
    if (b.y0 >= y + height || b.y1 <= y + 0.02) continue;
    if (x + RADIUS > b.x0 && x - RADIUS < b.x1 && z + RADIUS > b.z0 && z - RADIUS < b.z1) return b;
  }
  return null;
}

// Move one axis at a time so the player slides along walls.
function moveAxis(p, world, dx, dz, dt) {
  const h = p.crouch ? 1.15 : 1.7;
  if (dx !== 0) {
    const nx = p.x + dx;
    if (!collides(world, nx, p.y, p.z, h)) p.x = nx;
  }
  if (dz !== 0) {
    const nz = p.z + dz;
    if (!collides(world, p.x, p.y, nz, h)) p.z = nz;
  }
}

export function updatePlayer(p, state, world, input, audio, dt, fighters) {
  if (!p.alive) return;

  // --- Look (pointer lock deltas, consumed once per tick). ---
  const look = input.consumeLook();
  const sens = 0.0022;
  p.yaw -= look.dx * sens;
  p.pitch = clamp(p.pitch - look.dy * sens, -1.45, 1.45);
  // Recoil recovery: the pitch kick eases back toward the aim point.
  p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.055);
  p.viewKick = Math.max(0, p.viewKick - dt * 6);

  // --- Movement: acceleration + friction, slower while crouched or airborne. ---
  const axes = input.moveAxes();
  const moving = axes.x !== 0 || axes.z !== 0;
  const wantCrouch = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC');
  p.crouch = wantCrouch && p.onGround;
  const walking = input.down('ShiftLeft') || input.down('ShiftRight');
  const maxSpeed = p.crouch ? CROUCH_SPEED : walking ? WALK_SPEED * 0.55 : WALK_SPEED;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  const fx = -sin, fz = -cos, rx = cos, rz = -sin;
  let wx = fx * -axes.z + rx * axes.x;
  let wz = fz * -axes.z + rz * axes.x;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const accel = p.onGround ? ACCEL : ACCEL * AIR_CONTROL;
  p.vx += wx * accel * dt;
  p.vz += wz * accel * dt;
  // Friction when no input, stronger on ground.
  const fr = p.onGround ? FRICTION : 0.4;
  const damp = Math.max(0, 1 - fr * dt);
  if (!moving) { p.vx *= damp; p.vz *= damp; }
  const speed = Math.hypot(p.vx, p.vz);
  if (speed > maxSpeed) { p.vx *= maxSpeed / speed; p.vz *= maxSpeed / speed; }
  moveAxis(p, world, p.vx * dt, 0, dt);
  moveAxis(p, world, 0, p.vz * dt, dt);

  // --- Jump / gravity. ---
  if (input.down('Space') && p.onGround && !p.crouch) {
    p.vy = JUMP_VEL; p.onGround = false;
  }
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  else if (p.y > 0.02) p.onGround = false;

  // Footstep sounds while moving on the ground.
  if (p.onGround && speed > 2) {
    p.stepPhase += speed * dt;
    if (p.stepPhase > 2.4) { p.stepPhase = 0; audio.step(); }
  }

  // --- Firing. ---
  p.fireCooldown -= dt;
  const w = currentWeapon(p.loadout);
  const ammo = p.loadout.ammo[w.id];
  const wantFire = w.auto ? input.mouseDown : input.consumeClick();
  const canFire = (state.phase === 'live' || state.phase === 'planted') && !state.buyOpen;
  const firing = wantFire && p.fireCooldown <= 0 && p.reloadUntil <= state.time && canFire;
  if (firing) {
    if (ammo.mag > 0) {
      fireOnce(p, state, world, audio, fighters, w, ammo);
    } else {
      audio.dryFire();
      p.fireCooldown = 0.28;
      startReload(p, audio, state.time);
    }
  }
  if (input.down('KeyR')) startReload(p, audio, state.time);
  if (p.reloading && state.time >= p.reloadUntil) {
    const need = w.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take; ammo.reserve -= take;
    p.reloading = false;
  }

  // --- Spread bloom: grows while firing/moving, settles when still. ---
  const movingPenalty = speed / WALK_SPEED;
  const targetBloom = movingPenalty * 0.5 + (p.crouch ? -0.15 : 0);
  p.spreadBloom = clamp(p.spreadBloom + (targetBloom - p.spreadBloom) * dt * 4, 0, 1);

  // --- Grenade. ---
  if (input.down('KeyG') && !p.grenadeLock) {
    p.grenadeLock = true;
    if (p.loadout.grenades > 0) {
      const dir = aimDir(p.yaw, p.pitch, 0.01, state.rng);
      if (throwGrenade(state, p, dir)) audio.throwWhoosh();
    } else audio.denied();
  }
  if (!input.down('KeyG')) p.grenadeLock = false;

  // --- Weapon switching (1-4). ---
  for (let i = 0; i < 4; i++) {
    if (input.down(`Digit${i + 1}`) && !p.keyLock) {
      p.keyLock = true;
      const ids = ['gull', 'harpoon', 'squall', 'longshot'];
      const id = ids[i];
      if (p.loadout.ammo[id]) { p.loadout.current = id; p.reloading = false; p.reloadUntil = 0; audio.reload(); }
      break;
    }
  }
  if (!input.down('Digit1') && !input.down('Digit2') && !input.down('Digit3') && !input.down('Digit4')) p.keyLock = false;
}

function fireOnce(p, state, world, audio, fighters, w, ammo) {
  ammo.mag -= 1;
  p.fireCooldown = 60 / w.rpm;
  p.lastShot = state.time;
  const movingSpread = w.moveSpread * (Math.hypot(p.vx, p.vz) / 5.4);
  const spread = w.spread + movingSpread + p.spreadBloom * 0.012;
  const dir = aimDir(p.yaw, p.pitch + p.recoilPitch, spread, state.rng);
  const res = hitscan(state, world, p, dir, w, fighters);
  p.spreadBloom = clamp(p.spreadBloom + 0.22, 0, 1);
  p.recoilPitch = clamp(p.recoilPitch + w.recoil, 0, 0.09);
  p.viewKick = 1;
  state.stats.shots += 1;
  audio.shot(w.kind, 1);
  // Muzzle flash + tracer from the gun to the impact point.
  const eyeY = p.y + (p.crouch ? EYE_CROUCH : EYE_STAND);
  state.tracers.push({
    x0: p.x - Math.sin(p.yaw) * 0.3, y0: eyeY - 0.12, z0: p.z - Math.cos(p.yaw) * 0.3,
    x1: res.x, y1: res.y, z1: res.z, t: 0, life: 0.07,
  });
  state.particles.push({ kind: 'muzzle', x: p.x, y: eyeY - 0.12, z: p.z, t: 0, life: 0.06 });
  if (res.hit && res.hit.team !== p.team) {
    state.stats.hits += 1;
    if (res.head) state.stats.headshots += 1;
    // No spark burst for hits on the player: the impact is centimetres from
    // the camera and a world-space spark would fill the frame.
    if (!res.hit.isPlayer) {
      state.particles.push({ kind: 'spark', x: res.x, y: res.y, z: res.z, t: 0, life: 0.25 });
    }
    audio.hit(res.head);
  }
  // Gunshots are heard: bots within 26 m investigate.
  state.noise.push({ x: p.x, z: p.z, t: state.time, radius: 26 });
  if (state.noise.length > 12) state.noise.shift();
}

// Reload is sim-driven: reloadUntil is the state.time it completes at.
export function startReload(p, audio, now) {
  if (p.reloading) return;
  const w = currentWeapon(p.loadout);
  const ammo = p.loadout.ammo[w.id];
  if (ammo.mag >= w.mag || ammo.reserve <= 0) return;
  p.reloading = true;
  p.reloadUntil = now + w.reload;
  audio.reload();
}

export function eyePos(p) {
  return { x: p.x, y: p.y + (p.crouch ? EYE_CROUCH : EYE_STAND), z: p.z };
}
