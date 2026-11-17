// hud.js — the DOM layer. Reads state + fighters once per rendered frame
// and writes only what changed (cached text). Owns the buy menu, overlays
// and banners; the sim never touches document directly.
import { SITES } from './world.js';
import { WEAPONS, SHOP_ORDER, GRENADE, currentWeapon } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hpNum: $('hp-num'), hpFill: $('healthfill'),
      ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), wname: $('wname'), ammo: $('ammo'),
      timer: $('timer'), roundLabel: $('round-label'),
      scoreLan: $('score-lan'), scoreFog: $('score-fog'),
      objective: $('objective'), alive: $('alive'), money: $('money'),
      feed: $('feed'), banner: $('banner'), bannerBig: $('banner-big'), bannerSub: $('banner-sub'),
      progress: $('progress'), progressFill: $('progress-fill'), progressLbl: $('progress-lbl'),
      hint: $('hint'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      overlay: $('overlay'), play: $('play'), buy: $('buy'), shop: $('shop'), buyMoney: $('buy-money'),
      dmg: $('dmg'), flash: $('flash'),
    };
    this.cache = new Map();
    this.hitUntil = 0;
    this.killUntil = 0;
    this.buildShop();
  }

  set(id, text) {
    if (this.cache.get(id) !== text) { this.cache.set(id, text); this.el[id].textContent = text; }
  }

  buildShop() {
    const shop = this.el.shop;
    shop.innerHTML = '';
    SHOP_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      const div = document.createElement('div');
      div.className = 'item'; div.dataset.weapon = id;
      div.innerHTML = `<div class="nm"><span class="key">${i + 1}</span>${w.name}</div>
        <div class="ds">${w.desc}</div><div class="pr">$${w.price.toLocaleString()}</div>`;
      shop.appendChild(div);
    });
    const g = document.createElement('div');
    g.className = 'item'; g.dataset.weapon = 'flare';
    g.innerHTML = `<div class="nm"><span class="key">5</span>${GRENADE.name}</div>
      <div class="ds">${GRENADE.desc}</div><div class="pr">$${GRENADE.price} · max ${GRENADE.max}</div>`;
    shop.appendChild(g);
    const tip = document.createElement('div');
    tip.className = 'item';
    tip.innerHTML = `<div class="nm">How rounds pay</div>
      <div class="ds">Win $3,250 · Loss $1,900 · Kill $300 · Plant $300.<br>First to 5 rounds takes the night.</div><div class="pr">Pier 9 · Night Harbour</div>`;
    shop.appendChild(tip);
  }

  refreshShop(state, player) {
    for (const div of this.el.shop.querySelectorAll('.item[data-weapon]')) {
      const id = div.dataset.weapon;
      div.classList.remove('owned', 'cant');
      if (id === 'flare') {
        if (player.loadout.grenades >= GRENADE.max) div.classList.add('cant');
      } else {
        const w = WEAPONS[id];
        if (player.loadout.ammo[id]) div.classList.add('owned');
        else if (w.price > state.money) div.classList.add('cant');
      }
    }
    this.set('buyMoney', `$${state.money.toLocaleString()}`);
  }

  showHit(kill, now) {
    this.el.hitmarker.classList.add('on');
    this.el.hitmarker.classList.toggle('kill', kill);
    this.hitUntil = now + 0.14;
    if (kill) this.killUntil = now + 0.14;
  }

  showBanner(big, sub, win, until) {
    this.el.banner.style.display = 'block';
    this.el.banner.className = win === true ? 'win' : win === false ? 'lose' : '';
    this.el.banner.id = 'banner';
    this.set('bannerBig', big);
    this.set('bannerSub', sub);
    this.bannerUntil = until;
  }

  hideBanner() { this.el.banner.style.display = 'none'; }

  update(state, player, fighters, now) {
    const w = currentWeapon(player.loadout);
    const ammo = player.loadout.ammo[w.id];
    // Health.
    this.set('hpNum', String(Math.max(0, Math.ceil(player.hp))));
    const hpPct = Math.max(0, player.hp);
    this.el.hpFill.style.width = `${hpPct}%`;
    this.el.hpFill.classList.toggle('low', hpPct <= 30);
    // Ammo.
    this.set('wname', w.name);
    this.set('ammoMag', String(ammo.mag));
    this.set('ammoRes', ` / ${ammo.reserve}`);
    this.el.ammoMag.classList.toggle('empty', ammo.mag === 0);
    this.el.ammo.classList.toggle('empty', ammo.mag === 0);
    // Timer + score.
    const t = Math.max(0, Math.ceil(state.roundTime));
    const timerText = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.set('timer', timerText);
    this.el.timer.classList.toggle('low', t <= 10 && state.phase !== 'buy');
    this.set('roundLabel', `Round ${state.round}`);
    this.set('scoreLan', String(state.score[0]));
    this.set('scoreFog', String(state.score[1]));
    // Objective line.
    const attacking = state.attackTeam === 0;
    const obj = state.plant
      ? `Beacon live — <b>${state.plant.fuse.toFixed(0)}s</b> to detonation · Site ${state.plant.site}`
      : attacking
        ? `Plant the beacon at <span class="site">Site A (Crane)</span> or <span class="site">Site B (Warehouse)</span>`
        : `Defend <span class="site">Site A</span> and <span class="site">Site B</span> — hold the harbour`;
    if (this.cache.get('objective') !== obj) { this.cache.set('objective', obj); this.el.objective.innerHTML = obj; }
    // Alive counts + money.
    const lanAlive = fighters.filter((f) => f.team === 0 && f.alive).length;
    const fogAlive = fighters.filter((f) => f.team === 1 && f.alive).length;
    const aliveHtml = `<b>${lanAlive}</b> Lantern alive<br><b>${fogAlive}</b> Fog alive`;
    if (this.cache.get('aliveHtml') !== aliveHtml) { this.cache.set('aliveHtml', aliveHtml); this.el.alive.innerHTML = aliveHtml; }
    this.set('money', `$${state.money.toLocaleString()}`);
    // Kill feed.
    const feedHtml = state.feed.map((f) => `<div><b>${f.text}</b></div>`).join('');
    if (this.cache.get('feed') !== feedHtml) { this.cache.set('feed', feedHtml); this.el.feed.innerHTML = feedHtml; }
    // Crosshair spread.
    this.el.crosshair.classList.toggle('spread', player.spreadBloom > 0.35 || Math.hypot(player.vx, player.vz) > 3.5);
    // Hitmarker expiry.
    if (now > this.hitUntil) this.el.hitmarker.classList.remove('on');
    // Plant/defuse progress.
    const prog = player.planting ? player.plantProgress : player.defusing ? player.defuseProgress : null;
    if (prog !== null) {
      this.el.progress.style.display = 'block';
      this.set('progressLbl', player.planting ? 'Planting beacon — hold E' : 'Defusing beacon — hold E');
      this.el.progressFill.style.width = `${Math.round(prog * 100)}%`;
    } else {
      const botPlant = fighters.find((f) => !f.isPlayer && f.mode === 'plant' && f.alive);
      const botDefuse = fighters.find((f) => !f.isPlayer && f.mode === 'defuse' && f.alive);
      if (botPlant) {
        this.el.progress.style.display = 'block';
        this.set('progressLbl', `${botPlant.name} is planting the beacon`);
        this.el.progressFill.style.width = `${Math.round((botPlant.channel / 3.5) * 100)}%`;
      } else if (botDefuse) {
        this.el.progress.style.display = 'block';
        this.set('progressLbl', `${botDefuse.name} is defusing the beacon`);
        this.el.progressFill.style.width = `${Math.round((botDefuse.channel / 5) * 100)}%`;
      } else {
        this.el.progress.style.display = 'none';
      }
    }
    // Damage vignette + white flash decay.
    this.el.dmg.classList.toggle('on', state.flash > 0.25);
    this.el.flash.style.opacity = String(Math.max(0, state.flash * 0.5));
    // Banner expiry.
    if (this.bannerUntil && now > this.bannerUntil) this.hideBanner();
    // Hint line.
    let hint = '';
    if (state.phase === 'buy') hint = 'Buy phase — press B for the harbour stores';
    else if (state.phase === 'live' && attacking && !state.plant) {
      const nearA = Math.hypot(player.x - SITES.A.x, player.z - SITES.A.z) < SITES.A.r;
      const nearB = Math.hypot(player.x - SITES.B.x, player.z - SITES.B.z) < SITES.B.r;
      if (nearA || nearB) hint = 'Hold E to plant the beacon';
    } else if (state.phase === 'planted' && !attacking) {
      if (Math.hypot(player.x - state.plant.x, player.z - state.plant.z) < 3) hint = 'Hold E to defuse the beacon';
    }
    this.set('hint', hint);
    this.el.hint.style.display = hint ? 'block' : 'none';
  }
}
