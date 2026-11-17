# Harbourlight — Pier 9

[![threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/c/threejs-fps-01)
[![Rank](https://make.fun/badge/threejs-fps-01/Reki120/threejs-fps-01/rank.svg)](https://make.fun/c/threejs-fps-01)
[![Reward](https://make.fun/badge/threejs-fps-01/Reki120/threejs-fps-01/reward.svg)](https://make.fun/c/threejs-fps-01)

A round-based tactical FPS in three.js, built for the make.fun bounty
**threejs-fps-01** ("Make the best three.js tactical FPS").

## The game

Night on **Pier 9**, a container harbour lit by lamp amber and cold moonlight.
You are **Lantern Crew** (teal). The **Fog Runners** (amber) hold the far quay.
Each round your team either attacks — plant the beacon charge at **Site A
(the crane)** or **Site B (the warehouse)** — or defends the sites. Win the
round by planting and detonating the beacon, defusing it, running the clock
out as defenders, or eliminating the other team. First to 5 rounds takes the
night. 4v4: you plus three bot teammates against four bot enemies.

## What it has

- **Complete rounds**: buy phase (15 s) → live round (100 s) → win/loss
  banner → next round, with the attack side alternating each round.
- **Gunplay**: hitscan fire with headshot bonuses, recoil and spread that
  punish firing on the move, acceleration-based movement, crouch, jump,
  AABB map collision — stopping to aim pays.
- **Tactics**: bomb plant (hold E, 3.5 s) / defuse (5 s), 35 s fuse, money
  earned per round ($3,250 win / $1,900 loss / $300 kill / $300 plant) and a
  buy menu (B): 4 weapons (Gull-9 pistol, Harpoon rifle, Squall SMG,
  Longshot marksman) + Flare Charge grenades (G). Bots follow waypoint
  routes through the three lanes, hold positions, react to sight and
  gunshot sounds, and plant/defuse.
- **Map + look**: an original three-lane harbour — container stacks, a
  gantry crane, a warehouse, crates and barrels — with procedural canvas
  textures (no external assets), dusk lighting, fog, shadows and a water
  vista over the north railing. All sounds are procedural WebAudio.
- **Code**: one module per job (state, world, player, bots, combat,
  weapons, hud, input, audio, effects, textures, autopilot), a fixed 60 Hz
  simulation kept apart from rendering, pooled tracers/particles, state in
  one place.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| R | Reload |
| Ctrl / C | Crouch |
| Space | Jump |
| Shift | Walk (quiet, accurate) |
| B | Buy menu (buy phase) |
| 1–4 | Switch weapon · 5 buys a grenade in the shop |
| G | Throw Flare Charge |
| E | Plant / defuse the beacon (hold) |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: `game/` is static ES modules with the
vendored three.js 0.187.0.

## Screenshots

`?shot=start|buy|fight|plant&seed=1` stages deterministic scenes from the
game's own code (menu, buy phase, mid-fight, planting) for captures.

## Entry

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the
output dir and writes `dossier.json` via `vendor/makefun-threejs.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built from scratch for this bounty — new map, art, sounds
and names.
