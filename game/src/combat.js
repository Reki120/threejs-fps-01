// combat.js — hitscan fire, damage, death and grenades. Pure sim math over
// the shared state: it pushes tracers/particles/noise into state and lets
// effects.js render them. Fighters are the common shape player.js and
// bots.js both use: { x, y, z, yaw, hp, alive, crouch, team, name, ... }.
import { rayBox, rayColliders } from './world.js';
import { clamp } from './state.js';
import { GRENADE } from './weapons.js';

// A fighter's hit volumes: body box + head sphere. Head wins ties.
function fighterHit(ox, oy, oz, dx, dy, dz, f) {
  const h = f.crouch ? 1.15 : 1.7;
  const headY = f.y + (f.crouch ? 1.0 : 1.52);
  const body = { x0: f.x - 0.36, x1: f.x + 0.36, z0: f.z - 0.36, z1: f.z + 0.36, y0: f.y, y1: f.y + h };
  const tBody = rayBox(ox, oy, oz, dx, dy, dz, body);
  // Ray vs sphere, analytic.
  const cx = f.x - ox, cy = headY - oy, cz = f.z - oz;
  const tca = cx * dx + cy * dy + cz * dz;
  const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
  const r = 0.23;
  let tHead = Infinity;
  if (d2 <= r * r && tca > 0) tHead = tca - Math.sqrt(r * r - d2);
  if (tHead <= tBody) return { t: tHead, head: true };
  if (tBody < Infinity) return { t: tBody, head: false };
  return null;
}

// One hitscan shot from a fighter's eye along dir. Returns the outcome;
// the caller plays sound/tracer from it. Shooter excluded; teammates are
// solid (no friendly fire damage, but they block the shot).
export function hitscan(state, world, shooter, dir, weapon, fighters) {
  const eyeY = shooter.y + (shooter.crouch ? 1.05 : 1.62);
  const ox = shooter.x + Math.sin(shooter.yaw) * -0.0, oy = eyeY, oz = shooter.z;
  const wall = rayColliders(ox, oy, oz, dir.x, dir.y, dir.z, weapon.range, world.colliders);
  let bestT = wall ? wall.t : weapon.range;
  let bestF = null, bestHead = false;
  for (const f of fighters) {
    if (f === shooter || !f.alive) continue;
    const hit = fighterHit(ox, oy, oz, dir.x, dir.y, dir.z, f);
    if (hit && hit.t < bestT && hit.t > 0.05) { bestT = hit.t; bestF = f; bestHead = hit.head; }
  }
  const px = ox + dir.x * bestT, py = oy + dir.y * bestT, pz = oz + dir.z * bestT;
  let damage = 0;
  if (bestF) {
    const falloff = bestT > weapon.range * 0.6 ? weapon.falloff : 1;
    damage = Math.round(weapon.damage * (bestHead ? weapon.headMult : 1) * falloff);
    if (bestF.team !== shooter.team) {
      applyDamage(state, bestF, damage, shooter, bestHead);
    }
  }
  return { hit: bestF, head: bestHead, damage, x: px, y: py, z: pz, dist: bestT, blocked: !bestF && !!wall };
}

export function applyDamage(state, target, damage, attacker, head) {
  if (!target.alive) return;
  // Bots hit the player softer than they hit each other: four guns on one
  // human would otherwise end every round in seconds.
  if (attacker && !attacker.isPlayer && target.isPlayer) damage = Math.round(damage * 0.55);
  target.hp -= damage;
  target.lastHitBy = attacker;
  target.lastHitAt = state.time;
  if (target.isPlayer) state.shake = Math.min(1, state.shake + 0.35);
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  target.deathTime = state.time;
  const killer = attacker ? attacker.name : 'the harbour';
  state.feed.unshift({ text: `${killer} ▸ ${target.name}${head ? ' (headshot)' : ''}`, t: state.time });
  if (state.feed.length > 5) state.feed.pop();
  if (attacker && attacker.isPlayer && target.team !== attacker.team) {
    state.money += 300;
    state.kills[attacker.team] += 1;
  }
  if (target.isPlayer) state.flash = 1;
}

// Lob a flare charge from a fighter's hand along dir.
export function throwGrenade(state, fighter, dir) {
  if (fighter.loadout.grenades <= 0) return false;
  fighter.loadout.grenades -= 1;
  const eyeY = fighter.y + (fighter.crouch ? 1.05 : 1.62);
  state.grenades.push({
    x: fighter.x, y: eyeY, z: fighter.z,
    vx: dir.x * 17 + Math.sin(fighter.yaw) * 0, vy: dir.y * 17 + 4.5, vz: dir.z * 17,
    fuse: GRENADE.fuse, owner: fighter, bounced: 0,
  });
  return true;
}

// Grenade flight: gravity, box bounce, fuse, splash. Returns exploded list.
export function updateGrenades(state, world, dt, fighters) {
  const exploded = [];
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vy -= 16 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    g.fuse -= dt;
    if (g.y <= 0.12) {
      g.y = 0.12;
      if (Math.abs(g.vy) > 1.5) { g.vy = -g.vy * 0.42; g.vx *= 0.7; g.vz *= 0.7; }
      else { g.vy = 0; g.vx *= 0.86; g.vz *= 0.86; }
    }
    for (const b of world.colliders) {
      if (g.x > b.x0 && g.x < b.x1 && g.z > b.z0 && g.z < b.z1 && g.y < b.y1 && g.y > b.y0) {
        // Push out along the smallest penetration and reflect that axis.
        const dxl = g.x - b.x0, dxr = b.x1 - g.x, dzl = g.z - b.z0, dzr = b.z1 - g.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) { g.x = b.x0 - 0.01; g.vx = -Math.abs(g.vx) * 0.5; }
        else if (m === dxr) { g.x = b.x1 + 0.01; g.vx = Math.abs(g.vx) * 0.5; }
        else if (m === dzl) { g.z = b.z0 - 0.01; g.vz = -Math.abs(g.vz) * 0.5; }
        else { g.z = b.z1 + 0.01; g.vz = Math.abs(g.vz) * 0.5; }
        g.bounced++;
      }
    }
    if (g.fuse <= 0) {
      exploded.push(g);
      state.grenades.splice(i, 1);
      state.particles.push({ kind: 'boom', x: g.x, y: g.y, z: g.z, t: 0, life: 0.7 });
      state.shake = Math.min(1, state.shake + 0.5);
      for (const f of fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, (f.y + 0.9) - g.y, f.z - g.z);
        if (d > GRENADE.radius) continue;
        const dmg = Math.round(GRENADE.damage * (1 - d / GRENADE.radius) * 0.9 + 8);
        if (f.team !== g.owner.team) applyDamage(state, f, dmg, g.owner, false);
      }
    }
  }
  return exploded;
}

// Direction from a fighter's yaw/pitch, with spread applied (radians).
export function aimDir(yaw, pitch, spread, rng) {
  const a = yaw + (rng() - 0.5) * 2 * spread;
  const p = pitch + (rng() - 0.5) * 2 * spread;
  return {
    x: -Math.sin(a) * Math.cos(p),
    y: Math.sin(p),
    z: -Math.cos(a) * Math.cos(p),
  };
}

export function damageFlash(state) { state.flash = Math.min(1, state.flash + 0.4); }
export { clamp };
