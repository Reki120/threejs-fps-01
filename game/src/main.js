// main.js — boot, the fixed 60 Hz sim loop, round flow, buy menu wiring and
// the camera. The sim (state + player + bots + combat) runs at a fixed step;
// rendering only reads state and poses meshes.
import * as THREE from 'three';
import {
  createState, TICK, ROUND_TIME, BUY_TIME, PLANT_TIME, DEFUSE_TIME,
  ROUNDS_TO_WIN, START_MONEY, WIN_MONEY, LOSS_MONEY, TEAM_NAMES,
} from './state.js';
import { buildWorld, SITES, SPAWNS } from './world.js';
import { makeTextures } from './textures.js';
import { AudioBank } from './audio.js';
import { Input } from './input.js';
import { WEAPONS, GRENADE, freshLoadout, buyWeapon, buyGrenade, currentWeapon } from './weapons.js';
import { updateGrenades } from './combat.js';
import { createPlayer, updatePlayer, eyePos } from './player.js';
import { createBot, botNames, botBuy, updateBot, plantBomb } from './bots.js';
import { Hud } from './hud.js';
import { Fx, buildFighterMesh } from './effects.js';
import { applyShot } from './autopilot.js';

window.addEventListener('error', (e) => { window.__error = String(e.message); document.title = `ERR: ${e.message}`; });

const params = new URLSearchParams(location.search);
const shotParam = params.get('shot');
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Date.now() % 2147483647);

const state = createState(seed);
const audio = new AudioBank();
const hud = new Hud();
const input = new Input(document.getElementById('game'));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const tex = makeTextures();
const world = buildWorld(scene, tex);
const fx = new Fx(scene, camera);

// --- Fighters ---------------------------------------------------------------
const player = createPlayer('You');
player.loadout = freshLoadout();
player.plantProgress = 0; player.defuseProgress = 0;
const fighters = [player];
const botMeshes = new Map();
const lanNames = botNames(0), fogNames = botNames(1);
for (let i = 0; i < 3; i++) {
  const b = createBot(`lan-${i}`, 0, lanNames[i], SPAWNS[0][i + 1][0], SPAWNS[0][i + 1][1], -Math.PI / 2);
  fighters.push(b);
}
for (let i = 0; i < 4; i++) {
  const b = createBot(`fog-${i}`, 1, fogNames[i], SPAWNS[1][i][0], SPAWNS[1][i][1], Math.PI / 2);
  fighters.push(b);
}
const bots = fighters.filter((f) => !f.isPlayer);
for (const b of bots) {
  const mesh = buildFighterMesh(b);
  scene.add(mesh);
  botMeshes.set(b.id, mesh);
}

// --- Round flow --------------------------------------------------------------
state.attackTeam = 0;
let overAt = 0; // time the current round ended, for the next-round delay
let beepAt = 0;

function placeFighter(f, spawn, yaw) {
  f.x = spawn[0]; f.z = spawn[1]; f.y = 0;
  f.vx = 0; f.vz = 0; f.yaw = yaw; f.pitch = 0;
  f.hp = 100; f.alive = true; f.crouch = false;
  f.route = []; f.routeIdx = 0; f.target = null; f.mode = 'route';
  f.channel = 0; f.channelKind = null;
  if (f.isPlayer) { f.plantProgress = 0; f.defuseProgress = 0; f.planting = false; f.defusing = false; }
}

function startRound(n) {
  state.round = n;
  state.attackTeam = n % 2 === 1 ? 0 : 1; // Lantern attacks odd rounds
  state.phase = 'buy';
  state.roundTime = BUY_TIME;
  state.plant = null; state.defuse = null; state.plantProgress = 0;
  state.grenades.length = 0;
  state.winner = -1; state.winReason = '';
  world.beacon.visible = false;
  // Player: keep the loadout if they survived, else start over.
  if (!player.alive) player.loadout = freshLoadout();
  else if (player.loadout.primary) player.loadout.ammo[player.loadout.primary].reserve = WEAPONS[player.loadout.primary].reserve;
  placeFighter(player, SPAWNS[0][0], -Math.PI / 2);
  player.yaw = -Math.PI / 2;
  // Bots: fresh kit, richer as the match goes on.
  const lanBots = bots.filter((b) => b.team === 0);
  const fogBots = bots.filter((b) => b.team === 1);
  lanBots.forEach((b, i) => { b.loadout = freshLoadout(); botBuy(b, n, state.rng); placeFighter(b, SPAWNS[0][i + 1], -Math.PI / 2); });
  fogBots.forEach((b, i) => { b.loadout = freshLoadout(); botBuy(b, n, state.rng); placeFighter(b, SPAWNS[1][i], Math.PI / 2); });
  // Objective assignments: attackers split across the sites, defenders hold them.
  const attackers = bots.filter((b) => b.team === state.attackTeam);
  const defenders = bots.filter((b) => b.team !== state.attackTeam);
  attackers.forEach((b, i) => { b.site = i % 2 === 0 ? 'A' : 'B'; });
  defenders.forEach((b, i) => {
    b.site = i % 2 === 0 ? 'A' : 'B';
    const spots = world.holds[b.site];
    const spot = spots[i % spots.length];
    b.holdX = spot[0]; b.holdZ = spot[1];
    b.holdYaw = Math.atan2(-(spot[0] - b.x), -(spot[1] - b.z));
    b.mode = 'route';
  });
  hud.showBanner(`Round ${n} — ${TEAM_NAMES[state.attackTeam]} attack`, state.attackTeam === 0 ? 'Plant the beacon at A or B' : 'Defend the sites. Hold the harbour.', null, performance.now() / 1000 + 3);
  openBuy();
}

function startMatch() {
  state.score = [0, 0];
  state.money = START_MONEY;
  state.kills = [0, 0];
  startRound(1);
}

function endRound(winner, reason) {
  if (state.phase === 'over' || state.phase === 'matchover') return;
  state.phase = 'over';
  state.winner = winner;
  state.winReason = reason;
  state.score[winner] += 1;
  state.money += winner === 0 ? WIN_MONEY : LOSS_MONEY;
  overAt = state.time;
  const youWon = winner === 0;
  hud.showBanner(youWon ? 'Round won' : 'Round lost', `${reason} · ${TEAM_NAMES[winner]} take round ${state.round}`, youWon, performance.now() / 1000 + 4);
  if (youWon) audio.roundWin(); else audio.roundLose();
  state.plant = null;
  world.beacon.visible = false;
  closeBuy();
}

function endMatch() {
  state.phase = 'matchover';
  const youWon = state.score[0] > state.score[1];
  hud.el.overlay.hidden = false;
  document.querySelector('#overlay h1').innerHTML = youWon ? 'HARBOUR<span>LIGHT</span> — Night taken' : 'HARBOUR<span>LIGHT</span> — Night lost';
  document.querySelector('#overlay-copy, #overlay p').textContent =
    `Final score ${state.score[0]}–${state.score[1]}. ${youWon ? 'Lantern Crew owns Pier 9.' : 'The Fog Runners keep the harbour.'} Play again?`;
  hud.el.play.textContent = 'Play again';
}

// --- Buy menu ----------------------------------------------------------------
function openBuy() {
  if (state.phase !== 'buy') return;
  state.buyOpen = true;
  hud.el.buy.classList.add('open');
  hud.refreshShop(state, player);
}
function closeBuy() {
  state.buyOpen = false;
  hud.el.buy.classList.remove('open');
}
function toggleBuy() {
  if (state.phase !== 'buy') return;
  if (state.buyOpen) closeBuy(); else openBuy();
}
function tryBuy(id) {
  if (!state.buyOpen) return;
  if (id === 'flare') {
    const r = buyGrenade(player.loadout, state.money);
    if (r.ok) { state.money -= r.cost; audio.buy(); } else audio.denied();
  } else {
    const r = buyWeapon(player.loadout, state.money, id);
    if (r.ok) { state.money -= r.cost; audio.buy(); } else audio.denied();
  }
  hud.refreshShop(state, player);
}

// --- Input wiring ------------------------------------------------------------
input.onKey = (code, down) => {
  if (!down) return;
  if (code === 'KeyB') toggleBuy();
  if (code === 'Escape') closeBuy();
  if (state.buyOpen) {
    const map = { Digit1: 'harpoon', Digit2: 'squall', Digit3: 'longshot', Digit4: 'gull', Digit5: 'flare' };
    if (map[code]) tryBuy(map[code]);
  }
};
hud.el.play.addEventListener('click', () => {
  audio.unlock();
  hud.el.overlay.hidden = true;
  if (state.phase === 'menu' || state.phase === 'matchover') startMatch();
  input.lock();
});
input.onClick = () => {
  if (state.phase === 'live' || state.phase === 'planted' || state.phase === 'buy') input.lock();
};
input.onLockChange = (locked) => {
  if (!locked && (state.phase === 'live' || state.phase === 'planted' || state.phase === 'buy') && !state.autopilot) {
    hud.el.overlay.hidden = false;
    hud.el.play.textContent = 'Click to resume';
  }
};

// --- The sim tick ------------------------------------------------------------
function siteNear(f, site) {
  return Math.hypot(f.x - site.x, f.z - site.z) < site.r;
}

function tick(dt) {
  state.time += dt;
  state.flash = Math.max(0, state.flash - dt * 1.8);
  state.shake = Math.max(0, state.shake - dt * 1.4);

  if (state.phase === 'menu' || state.phase === 'matchover') return;

  if (state.phase === 'over') {
    if (state.time - overAt > 4.5) {
      if (state.score[0] >= ROUNDS_TO_WIN || state.score[1] >= ROUNDS_TO_WIN) endMatch();
      else startRound(state.round + 1);
    }
    return;
  }

  // Round clock.
  state.roundTime -= dt;
  if (state.phase === 'buy' && state.roundTime <= 0) {
    state.phase = 'live';
    state.roundTime = ROUND_TIME;
    closeBuy();
    hud.showBanner('Go — plant or defend', state.attackTeam === 0 ? 'Sites A and B are live' : 'Hold the sites', null, performance.now() / 1000 + 2);
  }

  // Planted bomb: fuse + beeps.
  if (state.plant) {
    state.plant.fuse -= dt;
    state.roundTime = Math.max(0, state.plant.fuse);
    if (state.time - beepAt > Math.max(0.35, state.plant.fuse / 35)) {
      beepAt = state.time;
      audio.plantBeep(state.plant.fuse < 5);
    }
    if (state.plant.fuse <= 0) {
      state.particles.push({ kind: 'boom', x: state.plant.x, y: 0.3, z: state.plant.z, t: 0, life: 0.7 });
      audio.explosion();
      endRound(state.attackTeam, 'Beacon detonated');
      return;
    }
    if (state.defuse && state.defuse.done) {
      endRound(1 - state.attackTeam, 'Beacon defused');
      return;
    }
  }

  // Timer expiry with no plant: defenders win.
  if ((state.phase === 'live') && state.roundTime <= 0) {
    endRound(1 - state.attackTeam, 'Time expired — sites held');
    return;
  }

  // Player channels: plant (attacker) and defuse (defender). Skipped for the
  // screenshot autopilot, which stages these states itself.
  if (player.alive && state.phase === 'live' && !state.autopilot) {
    player.planting = false; player.defusing = false;
    const attacking = state.attackTeam === 0;
    if (attacking && !state.plant) {
      const siteId = siteNear(player, SITES.A) ? 'A' : siteNear(player, SITES.B) ? 'B' : null;
      if (siteId && input.down('KeyE')) {
        player.planting = true;
        player.plantProgress += dt / PLANT_TIME;
        if (player.plantProgress >= 1) {
          plantBomb(state, siteId, player);
          audio.plantBeep(true);
          world.beacon.position.set(SITES[siteId].x, 0.2, SITES[siteId].z);
          world.beacon.visible = true;
          player.plantProgress = 0;
        }
      } else {
        player.plantProgress = Math.max(0, player.plantProgress - dt * 2);
      }
    }
    if (state.plant && !attacking) {
      const near = Math.hypot(player.x - state.plant.x, player.z - state.plant.z) < 3;
      if (near && input.down('KeyE')) {
        player.defusing = true;
        player.defuseProgress += dt / DEFUSE_TIME;
        if (player.defuseProgress >= 1) state.defuse = { by: player, done: true };
      } else {
        player.defuseProgress = 0;
      }
    }
  }

  // Bot plants light the beacon mesh.
  if (state.plant && !world.beacon.visible) {
    world.beacon.position.set(state.plant.x, 0.2, state.plant.z);
    world.beacon.visible = true;
  }

  // Fighters: the player may move during the buy phase, but bots hold at
  // spawn until the round goes live — no fighting before the clock starts.
  if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'planted') {
    updatePlayer(player, state, world, input, audio, dt, fighters);
  }
  if (state.phase === 'live' || state.phase === 'planted') {
    for (const b of bots) updateBot(b, state, world, fighters, audio, dt);
  }

  // Grenades.
  const booms = updateGrenades(state, world, dt, fighters);
  if (booms.length) {
    const p = player;
    for (const g of booms) {
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      audio.explosion();
      void d;
    }
  }

  // Elimination ends the round (only while nothing is planted).
  if (!state.plant && (state.phase === 'live' || state.phase === 'planted')) {
    const lanAlive = fighters.some((f) => f.team === 0 && f.alive);
    const fogAlive = fighters.some((f) => f.team === 1 && f.alive);
    if (!lanAlive) endRound(1, 'Lantern Crew eliminated');
    else if (!fogAlive) endRound(0, 'Fog Runners eliminated');
  }

  // Staged firefight: keep a tracer in the air so a still frame reads.
  if (state.autopilot && state.autopilot.shot === 'fight' && state.phase === 'live') {
    if (state.time - (state.lastShotTracer || 0) > 0.4) {
      state.lastShotTracer = state.time;
      const b = bots.find((x) => x.team === 1 && x.alive);
      if (b) {
        state.tracers.push({
          x0: b.x, y0: b.y + 1.5, z0: b.z,
          x1: player.x, y1: player.y + 1.3, z1: player.z,
          t: 0, life: 0.5,
        });
      }
    }
  }

  fx.consume(state);
}

// --- Render ------------------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  let steps = 0;
  while (acc >= TICK && steps < 5) {
    tick(TICK);
    acc -= TICK;
    steps++;
  }

  // Camera follows the player's eye, with recoil + shake.
  const eye = eyePos(player);
  const shakeAmp = state.shake * 0.03;
  camera.position.set(
    eye.x + (state.rng() - 0.5) * shakeAmp,
    eye.y + (state.rng() - 0.5) * shakeAmp,
    eye.z + (state.rng() - 0.5) * shakeAmp,
  );
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + player.recoilPitch;

  for (const b of bots) fx.poseFighter(botMeshes.get(b.id), b, dt);
  fx.poseGun(player, dt, now / 1000);
  fx.update(dt, state);

  // Water drift + beacon blink.
  world.waterMat.map.offset.x += dt * 0.008;
  world.waterMat.map.offset.y += dt * 0.004;
  if (world.beacon.visible) {
    const blink = Math.sin(now / 130) > 0 ? 3 : 0.4;
    world.beacon.children[1].material.emissiveIntensity = blink;
    world.beacon.rotation.y += dt;
  }
  world.lampGlow.intensity = 85 + Math.sin(now / 900) * 8;

  hud.update(state, player, fighters, now / 1000);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Start -------------------------------------------------------------------
if (shotParam) {
  // Screenshot mode: no pointer lock, staged scene, sim runs on its own.
  startMatch();
  closeBuy();
  applyShot({ state, player, bots, hud, input, openBuy }, shotParam);
  if (shotParam === 'fight' || shotParam === 'plant') {
    // Let bots settle a few ticks so poses read naturally.
    for (let i = 0; i < 30; i++) tick(TICK);
    // Undo any settle damage so the frame shows a healthy fighter.
    player.hp = 100; state.flash = 0; state.shake = 0;
    if (shotParam === 'fight') {
      // A tracer already in flight so the frame reads as a firefight.
      state.tracers.push({ x0: 5.8, y0: 1.5, z0: -3.8, x1: -7.6, y1: 1.4, z1: 1.8, t: 0, life: 0.07 });
    }
  }
  window.__game = { state, player, bots, fighters };
  window.__scene = scene;
} else {
  startMatch();
  // Menu overlay on top until the player clicks play; the buy phase waits.
  state.phase = 'menu';
  closeBuy();
  hud.el.overlay.hidden = false;
  window.__game = { state, player, bots, fighters };
  window.__scene = scene;
}
requestAnimationFrame(frame);
