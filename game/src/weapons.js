// weapons.js — the armoury. One table drives the HUD shop, the buy keys,
// bot loadouts and the firing model in combat.js. Damage is per body hit;
// headshots multiply it (see combat.js).

export const WEAPONS = {
  gull: {
    id: 'gull', name: 'Gull-9', kind: 'pistol', price: 0,
    damage: 26, headMult: 2, rpm: 320, mag: 12, reserve: 48,
    reload: 1.1, spread: 0.011, moveSpread: 0.02, recoil: 0.011, auto: false,
    range: 46, falloff: 0.55, desc: 'Sidearm. Free, fast, honest. 12 rounds.',
  },
  harpoon: {
    id: 'harpoon', name: 'Harpoon', kind: 'rifle', price: 2700,
    damage: 33, headMult: 2, rpm: 600, mag: 30, reserve: 90,
    reload: 2.2, spread: 0.006, moveSpread: 0.026, recoil: 0.017, auto: true,
    range: 70, falloff: 0.7, desc: 'Workhorse rifle. Full-auto, steady on the move.',
  },
  squall: {
    id: 'squall', name: 'Squall', kind: 'smg', price: 1500,
    damage: 24, headMult: 2, rpm: 820, mag: 32, reserve: 96,
    reload: 1.9, spread: 0.013, moveSpread: 0.02, recoil: 0.012, auto: true,
    range: 38, falloff: 0.45, desc: 'Close-quarters hose. Melts up close, fades far.',
  },
  longshot: {
    id: 'longshot', name: 'Longshot', kind: 'marksman', price: 4000,
    damage: 78, headMult: 4, rpm: 48, mag: 5, reserve: 20,
    reload: 2.8, spread: 0.0015, moveSpread: 0.09, recoil: 0.055, auto: false,
    range: 120, falloff: 0.95, desc: 'One breath, one shot. 4x headshot. Punishes movement.',
  },
};

export const GRENADE = {
  id: 'flare', name: 'Flare Charge', price: 300, max: 2,
  damage: 95, radius: 6.5, fuse: 1.6,
  desc: 'Thrown charge. 1.6 s fuse, heavy splash. Hold G to lob.',
};

export const SHOP_ORDER = ['harpoon', 'squall', 'longshot', 'gull'];

// A fresh loadout: pistol in hand, nothing bought. Kept on the fighter so
// the buy menu, bots and the HUD all read the same shape.
export function freshLoadout() {
  return {
    primary: null, // weapon id or null
    sidearm: 'gull',
    current: 'gull',
    grenades: 0,
    ammo: { gull: { mag: 12, reserve: 48 } },
  };
}

export function currentWeapon(loadout) {
  return WEAPONS[loadout.current];
}

export function buyWeapon(loadout, money, id) {
  const w = WEAPONS[id];
  if (!w) return { ok: false, reason: 'no such weapon' };
  if (w.price > money) return { ok: false, reason: 'not enough money' };
  if (loadout.primary === id || loadout.current === id) return { ok: false, reason: 'already owned' };
  if (w.kind === 'pistol') return { ok: false, reason: 'sidearm is free' };
  loadout.primary = id;
  loadout.current = id;
  loadout.ammo[id] = { mag: w.mag, reserve: w.reserve };
  return { ok: true, cost: w.price };
}

export function buyGrenade(loadout, money) {
  if (loadout.grenades >= GRENADE.max) return { ok: false, reason: 'carrying the max' };
  if (GRENADE.price > money) return { ok: false, reason: 'not enough money' };
  loadout.grenades += 1;
  return { ok: true, cost: GRENADE.price };
}
