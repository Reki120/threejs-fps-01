// bots.js — the seven AI fighters. Each bot runs a small state machine:
// route along the waypoint graph, hold a spot, scan for enemies, fight in
// bursts, react to gunshot noise, and plant or defuse the beacon. They share
// the fighter shape player.js uses, so combat.js treats both the same.
import { TEAM_LANTERN, TEAM_FOG, clamp } from './state.js';
import { WEAPONS, freshLoadout, currentWeapon } from './weapons.js';
import { hitscan, aimDir } from './combat.js';
import { losClear, nearestWaypoint, findRoute, SITES } from './world.js';

const BOT_NAMES = {
  0: ['Mira', 'Dara', 'Kio'], // Lantern teammates
  1: ['Vex', 'Rook', 'Ash', 'Nox'], // Fog runners
};
const BOT_SPEED = 4.3;
const EYE = 1.55;
const RADIUS = 0.36;

export function createBot(id, team, name, x, z, yaw) {
  const loadout = freshLoadout();
  return {
    isPlayer: false, id, name, team,
    x, y: 0, z, vx: 0, vz: 0, yaw, pitch: 0,
    hp: 100, alive: true, crouch: false,
    loadout,
    fireCooldown: 0, burstLeft: 0, burstPause: 0,
    mode: 'route', // route | hold | fight | plant | defuse | investigate
    route: [], routeIdx: 0,
    target: null, lastSeen: -99, lastSeenX: 0, lastSeenZ: 0,
    scanTimer: Math.random() * 0.15,
    holdX: x, holdZ: z, holdYaw: yaw,
    site: null, channel: 0, channelKind: null,
    hearX: 0, hearZ: 0, hearT: -99,
    skill: 0.55 + Math.random() * 0.3, // aim quality 0.55..0.85
    strafeDir: 1, strafeTimer: 0,
    deathTime: 0, stepPhase: 0,
  };
}

export function botNames(team) { return BOT_NAMES[team]; }

// Give bots a loadout for the round: richer as rounds go on.
export function botBuy(bot, round, rng) {
  const money = 800 + (round - 1) * 2200 + rng() * 900;
  const l = bot.loadout;
  const pick = money >= 4000 && rng() < 0.25 ? 'longshot'
    : money >= 2700 ? 'harpoon'
    : money >= 1500 && rng() < 0.6 ? 'squall' : 'gull';
  if (pick !== 'gull') {
    l.primary = pick; l.current = pick;
    l.ammo[pick] = { mag: WEAPONS[pick].mag, reserve: WEAPONS[pick].reserve };
  }
  if (rng() < 0.4) l.grenades = 1;
}

// --- movement ---------------------------------------------------------------

function botCollides(world, x, z) {
  for (const b of world.colliders) {
    if (b.y1 <= 0.02 || b.y0 >= 1.7) continue;
    if (x + RADIUS > b.x0 && x - RADIUS < b.x1 && z + RADIUS > b.z0 && z - RADIUS < b.z1) return true;
  }
  return false;
}

function moveBot(bot, world, tx, tz, dt, speed) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  const nx = bot.x + vx * dt;
  if (!botCollides(world, nx, bot.z)) bot.x = nx;
  const nz = bot.z + vz * dt;
  if (!botCollides(world, bot.x, nz)) bot.z = nz;
  // Face the movement direction: yaw 0 faces -Z, so yaw = atan2(-dx, -dz).
  bot.yaw = Math.atan2(-dx, -dz);
  return d < 0.6;
}

// --- perception -------------------------------------------------------------

function canSee(bot, enemy, world) {
  const dx = enemy.x - bot.x, dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 55) return false;
  // Field of view ~120° unless the enemy is very close or just fired.
  const ang = Math.atan2(-dx, -dz);
  let diff = Math.abs(ang - bot.yaw);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (dist > 6 && diff > 1.15) return false;
  const eyeY = bot.y + EYE;
  const targetY = enemy.y + (enemy.crouch ? 1.0 : 1.45);
  return losClear(bot.x, eyeY, bot.z, enemy.x, targetY, enemy.z, world.colliders);
}

// --- the tick ----------------------------------------------------------------

export function updateBot(bot, state, world, fighters, audio, dt) {
  if (!bot.alive) return;
  bot.fireCooldown -= dt;
  bot.scanTimer -= dt;

  const attacking = state.attackTeam === bot.team;
  const enemies = fighters.filter((f) => f.alive && f.team !== bot.team);

  // Periodic sight scan (staggered so not every bot scans every tick).
  if (bot.scanTimer <= 0) {
    bot.scanTimer = 0.12 + state.rng() * 0.08;
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (!canSee(bot, e, world)) continue;
      const d = Math.hypot(e.x - bot.x, e.z - bot.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    // The staged plant scene holds fire: the bots wait, the player plants.
    const stagingPlant = state.autopilot && state.autopilot.shot === 'plant';
    if (best && !stagingPlant) {
      bot.target = best;
      bot.lastSeen = state.time;
      bot.lastSeenX = best.x; bot.lastSeenZ = best.z;
      if (bot.mode !== 'fight') bot.mode = 'fight';
    } else if (bot.target && state.time - bot.lastSeen > 1.6) {
      bot.target = null;
      if (bot.mode === 'fight') bot.mode = 'route';
    }
  }

  // Hearing: a recent gunshot nearby pulls bots toward it.
  for (const n of state.noise) {
    if (state.time - n.t < 0.4 && Math.hypot(n.x - bot.x, n.z - bot.z) < n.radius) {
      bot.hearX = n.x; bot.hearZ = n.z; bot.hearT = state.time;
    }
  }

  // --- Objective logic. ---
  if (state.phase === 'live' || state.phase === 'planted') {
    if (attacking && !state.plant && bot.mode !== 'fight') {
      const site = SITES[bot.site];
      const inSite = Math.hypot(bot.x - site.x, bot.z - site.z) < site.r;
      const enemyNear = enemies.some((e) => Math.hypot(e.x - bot.x, e.z - bot.z) < 12 && canSee(bot, e, world));
      if (inSite && !enemyNear) {
        bot.mode = 'plant';
      } else if (bot.mode === 'plant' && !inSite) {
        bot.mode = 'route';
      }
    }
    if (state.plant && bot.team !== state.attackTeam) {
      // Defenders converge on the planted beacon.
      const s = SITES[state.plant.site];
      if (Math.hypot(bot.x - s.x, bot.z - s.z) < 2.2 && bot.mode !== 'fight') bot.mode = 'defuse';
      else if (bot.mode === 'defuse') bot.mode = 'route';
    }
  }

  // --- Act by mode. ---
  if (bot.mode === 'fight' && bot.target && bot.target.alive) {
    fightBot(bot, state, world, fighters, audio, dt);
    return;
  }
  if (bot.mode === 'plant') {
    bot.channel += dt;
    bot.channelKind = 'plant';
    bot.yaw += dt * 0.4; // looks around while planting
    if (bot.channel >= 3.5) {
      plantBomb(state, bot.site, bot);
      bot.channel = 0; bot.mode = 'route';
    }
    return;
  }
  if (bot.mode === 'defuse') {
    bot.channel += dt;
    bot.channelKind = 'defuse';
    if (bot.channel >= 5) {
      state.defuse = { by: bot, done: true };
      bot.channel = 0; bot.mode = 'route';
    }
    return;
  }
  bot.channel = 0; bot.channelKind = null;

  if (bot.mode === 'hold') {
    // Sway the aim across the lane; occasionally crouch.
    bot.yaw = bot.holdYaw + Math.sin(state.time * 0.5 + bot.id.charCodeAt(0)) * 0.55;
    bot.crouch = (state.time + bot.id.length) % 7 < 2.5;
    return;
  }

  // Route: follow waypoints toward the current goal.
  let goal = null;
  if (state.plant && bot.team !== state.attackTeam) {
    goal = SITES[state.plant.site];
  } else if (attacking && bot.site) {
    goal = SITES[bot.site];
  } else if (!attacking && bot.site) {
    goal = { x: bot.holdX, z: bot.holdZ };
  } else if (state.time - bot.hearT < 3) {
    goal = { x: bot.hearX, z: bot.hearZ };
  }
  if (!goal) { bot.mode = 'hold'; return; }

  const goalWp = nearestWaypoint(world.waypoints, goal.x, goal.z);
  const hereWp = nearestWaypoint(world.waypoints, bot.x, bot.z);
  if (bot.route.length === 0 || bot.route[bot.route.length - 1] !== goalWp) {
    bot.route = findRoute(world.waypoints, hereWp, goalWp);
    bot.routeIdx = 0;
  }
  const next = world.waypoints[bot.route[Math.min(bot.routeIdx, bot.route.length - 1)]];
  const arrived = moveBot(bot, world, next.x, next.z, dt, BOT_SPEED);
  if (arrived) {
    bot.routeIdx++;
    if (bot.routeIdx >= bot.route.length) {
      bot.route = [];
      if (!attacking) {
        bot.mode = 'hold';
        bot.holdX = bot.x; bot.holdZ = bot.z; bot.holdYaw = bot.yaw;
      } else if (state.plant) {
        bot.mode = 'hold';
      }
    }
  }
}

function fightBot(bot, state, world, fighters, audio, dt) {
  const t = bot.target;
  if (!t || !t.alive) { bot.target = null; bot.mode = 'route'; return; }
  const dx = t.x - bot.x, dz = t.z - bot.z;
  const dist = Math.hypot(dx, dz);
  const wantYaw = Math.atan2(-dx, -dz);
  let diff = wantYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.yaw += clamp(diff, -2.6 * dt, 2.6 * dt);

  // Strafe while fighting, keep 8-20 m when possible.
  bot.strafeTimer -= dt;
  if (bot.strafeTimer <= 0) { bot.strafeTimer = 0.7 + state.rng() * 0.9; bot.strafeDir = state.rng() < 0.5 ? -1 : 1; }
  const sx = Math.cos(bot.yaw) * bot.strafeDir, sz = -Math.sin(bot.yaw) * bot.strafeDir;
  const toward = dist > 20 ? 1 : dist < 7 ? -0.7 : 0;
  const mx = bot.x + (sx * 0.8 + (-Math.sin(bot.yaw)) * toward) * BOT_SPEED * 0.55 * dt;
  const mz = bot.z + (sz * 0.8 + (-Math.cos(bot.yaw)) * toward) * BOT_SPEED * 0.55 * dt;
  if (!botCollides(world, mx, bot.z)) bot.x = mx;
  if (!botCollides(world, bot.x, mz)) bot.z = mz;

  // Fire in bursts with pauses; accuracy falls with distance and target speed.
  const w = currentWeapon(bot.loadout);
  const ammo = bot.loadout.ammo[w.id];
  if (bot.burstPause > 0) { bot.burstPause -= dt; return; }
  if (bot.fireCooldown > 0 || ammo.mag <= 0) {
    if (ammo.mag <= 0 && ammo.reserve > 0) {
      const take = Math.min(w.mag, ammo.reserve);
      ammo.mag = take; ammo.reserve -= take;
    }
    return;
  }
  if (bot.burstLeft <= 0) {
    bot.burstLeft = 3 + ((state.rng() * 2) | 0);
    bot.burstPause = 0.5 + state.rng() * 0.7;
  }
  bot.burstLeft -= 1;
  bot.fireCooldown = 60 / w.rpm;
  const targetSpeed = Math.hypot(t.vx || 0, t.vz || 0);
  const err = (0.045 + dist * 0.0016 + targetSpeed * 0.004) * (1.35 - bot.skill);
  // Aim at the chest; the pitch carries the vertical error.
  const aimY = (t.y + (t.crouch ? 0.95 : 1.35)) - (bot.y + EYE);
  const dyaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(aimY, dist) + (state.rng() - 0.5) * err * 2;
  const dir2 = aimDir(dyaw, pitch, err, state.rng);
  const res = hitscan(state, world, bot, dir2, w, fighters);
  ammo.mag -= 1;
  const eyeY = bot.y + EYE;
  state.tracers.push({
    x0: bot.x - Math.sin(bot.yaw) * 0.3, y0: eyeY - 0.1, z0: bot.z - Math.cos(bot.yaw) * 0.3,
    x1: res.x, y1: res.y, z1: res.z, t: 0, life: 0.07,
  });
  const dPlayer = Math.hypot(bot.x - fighters.find((f) => f.isPlayer).x, bot.z - fighters.find((f) => f.isPlayer).z);
  const vol = clamp(1 - dPlayer / 55, 0.08, 1);
  audio.shot(w.kind, vol);
  if (res.hit && res.hit.team !== bot.team) {
    if (res.hit.isPlayer) audio.hurt();
    // No spark burst for hits on the player: the impact is centimetres from
    // the camera and a world-space spark would fill the frame.
    if (!res.hit.isPlayer) {
      state.particles.push({ kind: 'spark', x: res.x, y: res.y, z: res.z, t: 0, life: 0.25 });
    }
  }
  state.noise.push({ x: bot.x, z: bot.z, t: state.time, radius: 26 });
  if (state.noise.length > 12) state.noise.shift();
  if (bot.burstLeft <= 0) bot.burstPause = 0.7 + state.rng() * 0.7;
}

export function plantBomb(state, siteId, by) {
  const s = SITES[siteId];
  state.plant = { site: siteId, fuse: 35, x: s.x, z: s.z, plantedBy: by };
  state.phase = 'planted';
  state.roundTime = 35;
  state.feed.unshift({ text: `Beacon planted at Site ${siteId} by ${by.name}`, t: state.time });
  if (state.feed.length > 5) state.feed.pop();
  if (by.isPlayer) state.money += 300;
}
