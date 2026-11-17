// state.js — one place for all game state, constants and the seeded RNG.
// Nothing here touches the DOM or three.js: pure data the sim owns.

export const TICK = 1 / 60;
export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 15; // seconds of buy phase at round start
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;
export const ROUNDS_TO_WIN = 5;
export const START_MONEY = 800;
export const WIN_MONEY = 3250;
export const LOSS_MONEY = 1900;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;

export const TEAM_LANTERN = 0; // the player's team, teal
export const TEAM_FOG = 1; // the enemy team, amber
export const TEAM_NAMES = ['Lantern Crew', 'Fog Runners'];
export const TEAM_COLORS = [0x35c9b8, 0xf2a33c];

export const MAP = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };

// Deterministic RNG (mulberry32). Normal play seeds from the clock; the
// screenshot autopilot seeds from the URL so staged scenes are repeatable.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// The single mutable game state. The sim reads and writes this; the renderer
// only reads it. Modules never keep their own copy of round/score/money.
export function createState(seed) {
  return {
    rng: makeRng(seed),
    seed,
    phase: 'menu', // menu | buy | live | planted | over | matchover
    round: 1,
    score: [0, 0],
    roundTime: BUY_TIME,
    plant: null, // { site, fuse, x, z, plantedBy }
    defuse: null, // { by, progress }
    plantProgress: 0, // player plant channel 0..1
    bombSite: null,
    money: START_MONEY,
    kills: [0, 0],
    time: 0, // sim seconds since boot
    roundStartTime: 0,
    winner: -1,
    winReason: '',
    bannerUntil: 0,
    feed: [], // { text, t } newest first, capped in hud
    noise: [], // { x, z, t, radius } gunshot sounds bots can hear
    grenades: [],
    tracers: [],
    particles: [],
    shake: 0,
    flash: 0,
    slowmo: 1,
    autopilot: null, // { shot, seed } when ?shot= is present
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
}
