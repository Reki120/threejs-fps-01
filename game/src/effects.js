// effects.js — everything the sim's transient records become on screen:
// fighter bodies, the viewmodel gun, tracers, muzzle light and explosion
// flashes. Pools are allocated once; the tick only moves them.
import * as THREE from 'three';
import { TEAM_COLORS } from './state.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 40;

function limb(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1 }));
  m.castShadow = true;
  return m;
}

// A readable humanoid: dark kit, team-coloured vest + helmet band, gun in hand.
export function buildFighterMesh(fighter) {
  const g = new THREE.Group();
  const teamCol = TEAM_COLORS[fighter.team];
  const cloth = 0x232a33;
  const legL = limb(0.16, 0.78, 0.18, cloth); legL.position.set(-0.11, 0.39, 0);
  const legR = limb(0.16, 0.78, 0.18, cloth); legR.position.set(0.11, 0.39, 0);
  const torso = limb(0.52, 0.62, 0.3, cloth); torso.position.y = 1.09;
  const vest = limb(0.54, 0.4, 0.32, teamCol); vest.position.y = 1.12;
  const head = limb(0.26, 0.26, 0.26, 0xc9a184); head.position.y = 1.56;
  const helmet = limb(0.3, 0.14, 0.3, teamCol); helmet.position.y = 1.68;
  const armL = limb(0.13, 0.55, 0.15, cloth); armL.position.set(-0.33, 1.12, 0.08);
  const armR = limb(0.13, 0.55, 0.15, cloth); armR.position.set(0.33, 1.12, 0.08);
  const gun = limb(0.07, 0.1, 0.62, 0x14181d); gun.position.set(0.22, 1.18, -0.28);
  g.add(legL, legR, torso, vest, head, helmet, armL, armR, gun);
  g.userData = { legL, legR, armL, armR, head, torso, dead: false, fallT: 0, walkPhase: Math.random() * 6 };
  return g;
}

export class Fx {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    // Tracer pool: one Line per slot, two points each, additive amber.
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, t: 0, life: 0 });
    }
    this.tracerIdx = 0;
    // Spark pool: tiny additive points (kept small: an impact near the
    // camera must never fill the frame).
    this.sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
      scene.add(m);
      this.sparks.push({ m, t: 0, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.sparkIdx = 0;
    // Explosion flash: one reusable sphere + light.
    this.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0 }));
    this.boomLight = new THREE.PointLight(0xff8c2e, 0, 18, 1.6);
    scene.add(this.boom, this.boomLight);
    this.boomT = 1;
    // Muzzle flash light on the camera rig.
    this.muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
    camera.add(this.muzzleLight);
    this.muzzleLight.position.set(0.3, -0.25, -0.8);
    this.muzzleT = 1;
    this.buildViewmodel();
  }

  buildViewmodel() {
    const gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2127, roughness: 0.5, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x35c9b8, roughness: 0.4, metalness: 0.5, emissive: 0x0d3a36, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.42);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), dark);
    grip.position.set(0, -0.14, 0.14); grip.rotation.x = 0.3;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), accent);
    sight.position.set(0, 0.09, -0.1);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
    mag.position.set(0, -0.12, -0.02); mag.rotation.x = 0.15;
    gun.add(body, barrel, grip, sight, mag);
    gun.position.set(0.28, -0.26, -0.55);
    this.camera.add(gun);
    this.gun = gun;
    // Flash quad at the muzzle.
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    flash.position.set(0.28, -0.24, -1.0);
    this.camera.add(flash);
    this.flash = flash;
  }

  // Push sim records into the pools. Called once per sim tick.
  consume(state) {
    for (const tr of state.tracers) {
      const slot = this.tracers[this.tracerIdx];
      this.tracerIdx = (this.tracerIdx + 1) % MAX_TRACERS;
      const pos = slot.line.geometry.attributes.position.array;
      pos[0] = tr.x0; pos[1] = tr.y0; pos[2] = tr.z0;
      pos[3] = tr.x1; pos[4] = tr.y1; pos[5] = tr.z1;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.material.opacity = 0.9;
      slot.t = 0; slot.life = tr.life;
    }
    state.tracers.length = 0;
    for (const pt of state.particles) {
      if (pt.kind === 'spark') {
        for (let k = 0; k < 5; k++) {
          const s = this.sparks[this.sparkIdx];
          this.sparkIdx = (this.sparkIdx + 1) % MAX_SPARKS;
          s.m.position.set(pt.x, pt.y, pt.z);
          s.vx = (Math.random() - 0.5) * 4; s.vy = Math.random() * 3; s.vz = (Math.random() - 0.5) * 4;
          s.t = 0; s.life = 0.3 + Math.random() * 0.2;
          s.m.material.opacity = 1;
        }
      } else if (pt.kind === 'boom') {
        this.boom.position.set(pt.x, pt.y + 0.4, pt.z);
        this.boomT = 0;
        this.boomLight.position.set(pt.x, pt.y + 1, pt.z);
      } else if (pt.kind === 'muzzle') {
        this.muzzleT = 0;
        this.flash.material.opacity = 0.95;
        this.flash.rotation.z = Math.random() * Math.PI;
        this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
      }
    }
    state.particles.length = 0;
  }

  update(dt, state) {
    for (const slot of this.tracers) {
      if (slot.life <= 0) continue;
      slot.t += dt;
      slot.line.material.opacity = Math.max(0, 0.9 * (1 - slot.t / slot.life));
      if (slot.t >= slot.life) slot.life = 0;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.t += dt;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
      s.vy -= 9 * dt;
      s.m.material.opacity = Math.max(0, 1 - s.t / s.life);
      if (s.t >= s.life) { s.life = 0; s.m.material.opacity = 0; }
    }
    if (this.boomT < 1) {
      this.boomT = Math.min(1, this.boomT + dt / 0.7);
      const k = 1 - this.boomT;
      this.boom.scale.setScalar(1 + this.boomT * 5.5);
      this.boom.material.opacity = k * 0.75;
      this.boomLight.intensity = k * 220;
    } else {
      this.boom.material.opacity = 0; this.boomLight.intensity = 0;
    }
    if (this.muzzleT < 1) {
      this.muzzleT = Math.min(1, this.muzzleT + dt / 0.06);
      const k = 1 - this.muzzleT;
      this.flash.material.opacity = k * 0.95;
      this.muzzleLight.intensity = k * 26;
    } else {
      this.flash.material.opacity = 0; this.muzzleLight.intensity = 0;
    }
  }

  // Per-frame fighter mesh pose: walk bob, aim yaw, death fall.
  poseFighter(mesh, fighter, dt) {
    const u = mesh.userData;
    const moved = Math.hypot(fighter.x - (u.px ?? fighter.x), fighter.z - (u.pz ?? fighter.z));
    const speed = dt > 0 ? moved / dt : 0;
    u.px = fighter.x; u.pz = fighter.z;
    mesh.position.set(fighter.x, fighter.y, fighter.z);
    if (!fighter.alive) {
      if (!u.dead) { u.dead = true; u.fallT = 0; }
      u.fallT = Math.min(1, u.fallT + dt * 2.2);
      mesh.rotation.x = -Math.PI / 2 * u.fallT;
      mesh.position.y = fighter.y + 0.25 * u.fallT;
      return;
    }
    mesh.rotation.y = fighter.yaw;
    const moving = speed > 0.5;
    if (moving) u.walkPhase += dt * speed * 1.9;
    const swing = moving ? Math.sin(u.walkPhase) * 0.55 : 0;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.6; u.armR.rotation.x = swing * 0.6 - 0.5;
    mesh.position.y = fighter.y + (moving ? Math.abs(Math.sin(u.walkPhase)) * 0.05 : 0);
    if (fighter.crouch) mesh.scale.y = 0.72;
    else mesh.scale.y = 1;
  }

  // Viewmodel kick + sway from the player's state.
  poseGun(player, dt, time) {
    const kick = player.viewKick;
    this.gun.position.z = -0.55 + kick * 0.09;
    this.gun.position.y = -0.26 + Math.sin(time * 1.4) * 0.004 + (player.crouch ? -0.02 : 0);
    this.gun.rotation.x = kick * 0.14;
  }
}
