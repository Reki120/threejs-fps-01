// world.js — Pier 9, a night container harbour. Builds the map, its colliders,
// the waypoint graph bots walk, the two bomb sites and the sky. Also owns the
// analytic ray-vs-box tests combat and bot sight use (no three.js Raycaster).
import * as THREE from 'three';
import { TEAM_COLORS } from './state.js';

export const SITES = {
  A: { id: 'A', name: 'Crane', x: 24, z: -16, r: 4.5 },
  B: { id: 'B', name: 'Warehouse', x: 24, z: 16, r: 4.5 },
};

export const SPAWNS = {
  0: [[-28, -10], [-28, 0], [-28, 10], [-29, -17]], // Lantern, west quay
  1: [[28, -10], [28, 0], [28, 10], [29, 17]], // Fog, east quay
};

// Ray vs axis-aligned box. Returns the entry distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Nearest collider hit along a ray, or null. Reuses one result object.
const _hit = { t: 0, x: 0, y: 0, z: 0, box: null };
export function rayColliders(ox, oy, oz, dx, dy, dz, maxDist, colliders) {
  let best = Infinity, bestBox = null;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, colliders[i]);
    if (t < best && t <= maxDist) { best = t; bestBox = colliders[i]; }
  }
  if (!bestBox) return null;
  _hit.t = best; _hit.x = ox + dx * best; _hit.y = oy + dy * best; _hit.z = oz + dz * best; _hit.box = bestBox;
  return _hit;
}

// True when nothing solid stands between two points (eye height given).
export function losClear(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = rayColliders(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, colliders);
  return hit === null;
}

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, tex) {
  const colliders = [];
  const addCollider = (x0, z0, x1, z1, y0 = 0, y1 = 99) =>
    colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1 });

  const matDeck = new THREE.MeshStandardMaterial({ map: tex.deck, roughness: 0.85, metalness: 0.15 });
  const matTeal = new THREE.MeshStandardMaterial({ map: tex.containerTeal, roughness: 0.7, metalness: 0.35 });
  const matRust = new THREE.MeshStandardMaterial({ map: tex.containerRust, roughness: 0.75, metalness: 0.3 });
  const matClad = new THREE.MeshStandardMaterial({ map: tex.cladding, roughness: 0.8, metalness: 0.25 });
  const matCrate = new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9, metalness: 0.05 });
  const matConc = new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, metalness: 0.05 });
  const matSteel = new THREE.MeshStandardMaterial({ color: 0x2c343e, roughness: 0.55, metalness: 0.7 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1a2027, roughness: 0.8, metalness: 0.4 });
  const matHazard = new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8, metalness: 0.1 });

  // Sky, fog, lights: a cold dusk over black water.
  scene.background = new THREE.Color(0x0d1622);
  scene.fog = new THREE.Fog(0x0d1622, 28, 95);
  const hemi = new THREE.HemisphereLight(0x44586e, 0x14181d, 1.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xafc6dd, 1.6);
  moon.position.set(-30, 42, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
  moon.shadow.camera.far = 120;
  scene.add(moon);
  const lampGlow = new THREE.PointLight(0xf2a33c, 90, 26, 1.8);
  lampGlow.position.set(0, 7.5, 0);
  scene.add(lampGlow);

  // Deck.
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), matDeck);
  deck.rotation.x = -Math.PI / 2; deck.receiveShadow = true;
  scene.add(deck);

  // Harbour water beyond the north edge, with a low railing so the vista reads.
  const waterMat = new THREE.MeshStandardMaterial({ map: tex.water, roughness: 0.25, metalness: 0.6, color: 0x9fc4d8 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.35, -44);
  scene.add(water);
  for (let x = -30; x <= 30; x += 6) {
    const post = box(0.12, 1.1, 0.12, matSteel, x, 0.55, -23.9);
    scene.add(post);
  }
  const rail = box(64, 0.08, 0.08, matSteel, 0, 1.05, -23.9);
  scene.add(rail);
  addCollider(-32, -24.4, 32, -23.8, 0, 1.1); // railing blocks walking off

  // Perimeter walls (south, west, east), 4.5 m concrete.
  const wall = (w, d, x, z) => { scene.add(box(w, 4.5, d, matConc, x, 2.25, z)); };
  wall(64, 1, 0, 24.5); addCollider(-32, 24, 32, 25, 0, 4.5);
  wall(1, 48, -32.5, 0); addCollider(-33, -24, -32, 24, 0, 4.5);
  wall(1, 48, 32.5, 0); addCollider(32, -24, 33, 24, 0, 4.5);

  // --- Containers: north lane stacks, mid-yard blocks, south row. ---
  const container = (x, z, w, h, d, mat, ry = 0) => {
    scene.add(box(w, h, d, mat, x, h / 2, z, ry));
    const hw = (ry === 0 ? w : d) / 2, hd = (ry === 0 ? d : w) / 2;
    addCollider(x - hw, z - hd, x + hw, z + hd, 0, h);
  };
  container(-20, -18, 12, 2.6, 2.6, matTeal);
  container(-20, -15.2, 12, 2.6, 2.6, matRust); // north stack, two high on the left
  container(-14, -18, 6, 5.2, 2.6, matRust);
  container(-8, -19, 6, 2.6, 2.6, matTeal);
  container(2, -19.5, 8, 2.6, 2.6, matRust);
  container(12, -18, 6, 2.6, 2.6, matTeal);
  container(18, -19, 6, 5.2, 2.6, matTeal);
  container(-24, 6, 2.6, 2.6, 8, matRust, 0);
  container(-14, 12, 6, 2.6, 2.6, matTeal);
  container(-6, 18, 8, 2.6, 2.6, matRust);
  container(4, 12, 2.6, 5.2, 6, matTeal);
  container(12, 18, 6, 2.6, 2.6, matRust);
  container(16, 6, 2.6, 2.6, 8, matTeal);
  container(-26, -6, 6, 2.6, 2.6, matTeal);
  container(26, -6, 6, 2.6, 2.6, matRust);

  // --- Gantry crane over mid lane (x = 8), legs + top beam + hanging hook. ---
  for (const z of [-7, 7]) {
    scene.add(box(1.2, 11, 1.2, matSteel, 8, 5.5, z));
    addCollider(7.4, z - 0.6, 8.6, z + 0.6, 0, 11);
    scene.add(box(2.4, 0.5, 2.4, matDark, 8, 0.25, z));
  }
  scene.add(box(1.4, 1.4, 15.5, matSteel, 8, 11.4, 0));
  scene.add(box(3.2, 1.8, 3.2, matDark, 8, 9.6, 0));
  const hook = box(0.5, 2.2, 0.5, matHazard, 8, 8.2, 0);
  scene.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), matDark);
  cable.position.set(8, 10.2, 0); scene.add(cable);

  // --- Warehouse block, south-east, with a big door at Site B. ---
  scene.add(box(12, 6, 16, matClad, 26, 3, 16));
  addCollider(20, 8, 32, 24, 0, 6);
  scene.add(box(5, 4.2, 0.3, matDark, 24, 2.1, 8.05));
  const doorLight = new THREE.PointLight(0xf2a33c, 25, 14, 1.8);
  doorLight.position.set(24, 4.6, 7.2); scene.add(doorLight);

  // --- Crates and barrels: low cover in mid and lanes. ---
  const crate = (x, z, s = 1.1) => {
    scene.add(box(s, s, s, matCrate, x, s / 2, z, (x * 7 + z * 3) % 1.2));
    addCollider(x - s / 2, z - s / 2, x + s / 2, z + s / 2, 0, s);
  };
  crate(-2, -4); crate(-1, -2.6, 0.9); crate(14, -4); crate(15.4, -2.8, 0.9);
  crate(-12, 2); crate(2, 6); crate(10, 2); crate(20, 10); crate(-18, 16);
  crate(6, -12); crate(-4, -12, 0.9);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.6, metalness: 0.5 });
  for (const [x, z] of [[-10, -8], [-9.2, -7.2], [18, 0], [18.8, 0.8], [0, 16]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), barrelMat);
    b.position.set(x, 0.55, z); b.castShadow = true; scene.add(b);
    addCollider(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 0, 1.1);
  }

  // --- Lamp posts: warm pools of light down each lane. ---
  const lampPositions = [[-24, -12], [-8, 0], [8, -12], [20, 0], [-16, 16], [24, -8]];
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xf2a33c, emissive: 0xf2a33c, emissiveIntensity: 2.2 });
  for (const [x, z] of lampPositions) {
    scene.add(box(0.18, 6, 0.18, lampMat, x, 3, z));
    const arm = box(1.4, 0.14, 0.14, lampMat, x + 0.6, 5.9, z);
    scene.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulbMat);
    bulb.position.set(x + 1.2, 5.8, z); scene.add(bulb);
    const pl = new THREE.PointLight(0xf2a33c, 22, 15, 1.8);
    pl.position.set(x + 1.2, 5.6, z); scene.add(pl);
  }

  // --- Site markings: hazard ring + floating beacon letter. ---
  const siteMeshes = {};
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xf2a33c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.06, s.z);
    scene.add(ring);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2a33c, transparent: true, opacity: 0.3 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(s.x, 0.05, s.z);
    scene.add(pad);
    siteMeshes[key] = { ring, pad };
  }

  // The planted beacon: a small blinking charge, hidden until planted.
  const beacon = new THREE.Group();
  const beaconBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }));
  beaconBody.castShadow = true; beacon.add(beaconBody);
  const beaconLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xe4572e, emissive: 0xe4572e, emissiveIntensity: 3 }));
  beaconLight.position.y = 0.24; beacon.add(beaconLight);
  beacon.position.y = 0.2; beacon.visible = false;
  scene.add(beacon);

  // Waypoint graph: nodes along the three lanes and the cross-links.
  const wp = [
    [-28, 0], [-22, -2], [-16, -6], [-10, -10], [-4, -14], [4, -16], [12, -17], [18, -16], [24, -16], // north lane
    [-28, 10], [-20, 8], [-12, 6], [-4, 2], [2, 0], [10, -2], [16, -4], [22, -8], // mid lane
    [-24, 18], [-16, 18], [-8, 18], [0, 16], [8, 16], [16, 16], [24, 16], // south lane
    [-16, -12], [4, -8], [14, 8], [24, 4], [28, 0], [28, -10], // connectors
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16],
    [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23],
    [2, 24], [24, 3], [5, 25], [25, 14], [14, 26], [26, 15], [15, 27], [27, 28], [28, 16],
    [1, 10], [10, 17], [11, 19], [13, 20], [21, 27], [7, 28], [8, 29], [23, 29], [28, 29], [16, 29],
    [0, 9], [9, 17], [16, 29], [22, 28],
  ];
  const waypoints = wp.map(([x, z], i) => ({ id: i, x, z, links: [] }));
  for (const [a, b] of edges) { waypoints[a].links.push(b); waypoints[b].links.push(a); }

  // Hold spots: where defenders wait, keyed by site.
  const holds = {
    A: [[18, -12], [12, -14], [20, -10], [26, -12]],
    B: [[18, 12], [14, 18], [20, 20], [26, 10]],
  };

  return { colliders, waypoints, holds, siteMeshes, beacon, waterMat, lampGlow };
}

// Breadth-first route through the waypoint graph. Returns node ids.
export function findRoute(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of waypoints[cur].links) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let n = cur;
        while (n !== -1) { path.unshift(n); n = prev.get(n); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function nearestWaypoint(waypoints, x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const d = (waypoints[i].x - x) ** 2 + (waypoints[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
