// autopilot.js — deterministic staged scenes for screenshots, driven by
// URL params: ?shot=start|buy|fight|plant&seed=1. These are real renders of
// the game's own code: the autopilot only places fighters, picks a camera
// angle and opens the matching overlay, then the normal sim runs.
import { SITES } from './world.js';

function place(game, px, pz, yaw, pitch = 0) {
  const p = game.player;
  p.x = px; p.z = pz; p.y = 0; p.vx = 0; p.vz = 0;
  p.yaw = yaw; p.pitch = pitch;
  p.hp = 100; p.alive = true;
}

function placeBot(bot, x, z, yaw, mode = 'hold') {
  bot.x = x; bot.z = z; bot.y = 0; bot.yaw = yaw;
  bot.mode = mode; bot.route = []; bot.target = null;
  bot.alive = true; bot.hp = 100;
  bot.holdX = x; bot.holdZ = z; bot.holdYaw = yaw;
}

// Yaw that looks from (x,z) toward (tx,tz): yaw 0 faces -Z.
function lookYaw(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

export function applyShot(game, shot) {
  const { state, player, bots, hud, input } = game;
  state.autopilot = { shot, seed: state.seed };
  const lanBots = bots.filter((b) => b.team === 0);
  const fogBots = bots.filter((b) => b.team === 1);

  if (shot === 'start') {
    // Menu over the harbour: player at the west quay, mid lane ahead.
    state.phase = 'menu';
    place(game, -28, 0, lookYaw(-28, 0, 10, -2));
    placeBot(fogBots[0], -6, -6, lookYaw(-6, -6, -28, 0));
    placeBot(fogBots[1], 4, 4, lookYaw(4, 4, -28, 0));
    placeBot(lanBots[0], -20, -8, lookYaw(-20, -8, 10, 0));
    hud.el.overlay.hidden = false;
    return;
  }

  if (shot === 'buy') {
    // Buy phase with the stores open, crane yard behind the panel.
    state.phase = 'buy';
    state.roundTime = 12;
    place(game, -22, 4, lookYaw(-22, 4, 8, -2));
    placeBot(lanBots[0], -18, -2, lookYaw(-18, -2, 8, 0));
    placeBot(lanBots[1], -16, 8, lookYaw(-16, 8, 8, 0));
    placeBot(fogBots[0], 6, -8, lookYaw(6, -8, -22, 4));
    hud.el.overlay.hidden = true;
    game.openBuy();
    return;
  }

  if (shot === 'fight') {
    // Mid-round firefight in the crane yard: enemies in the open, one
    // mid-burst, tracers in the air.
    state.phase = 'live';
    state.roundTime = 73;
    place(game, -8, 2, lookYaw(-8, 2, 8, -4), 0.02);
    player.loadout.primary = 'harpoon';
    player.loadout.current = 'harpoon';
    player.loadout.ammo.harpoon = { mag: 30, reserve: 90 };
    placeBot(fogBots[0], 6, -4, lookYaw(6, -4, -8, 2));
    placeBot(fogBots[1], 10, 2, lookYaw(10, 2, -8, 2));
    placeBot(fogBots[2], 2, -10, lookYaw(2, -10, -8, 2));
    placeBot(lanBots[0], -14, -4, lookYaw(-14, -4, 8, -2));
    placeBot(lanBots[1], -12, 8, lookYaw(-12, 8, 8, -2));
    fogBots[0].mode = 'fight';
    fogBots[0].target = player;
    fogBots[0].lastSeen = state.time;
    hud.el.overlay.hidden = true;
    return;
  }

  if (shot === 'plant') {
    // Planting the beacon at Site A, teammates covering, one defender peeking.
    state.phase = 'live';
    state.roundTime = 41;
    state.attackTeam = 0;
    const s = SITES.A;
    place(game, s.x - 1.5, s.z + 1, lookYaw(s.x - 1.5, s.z + 1, 12, -14), 0.05);
    player.planting = true;
    player.plantProgress = 0.62;
    placeBot(lanBots[0], s.x + 2, s.z - 3, lookYaw(s.x + 2, s.z - 3, 12, -14));
    placeBot(lanBots[1], s.x - 4, s.z - 2, lookYaw(s.x - 4, s.z - 2, 18, -16));
    placeBot(fogBots[0], 12, -12, lookYaw(12, -12, s.x, s.z));
    placeBot(fogBots[1], 18, -8, lookYaw(18, -8, s.x, s.z));
    hud.el.overlay.hidden = true;
    return;
  }

  // Unknown shot: behave like a normal menu.
  state.phase = 'menu';
  hud.el.overlay.hidden = false;
  void input;
}
