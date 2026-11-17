// textures.js — every texture is painted on a canvas at boot. No external
// images, no network: the harbour's look comes from code alone.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    const s = 1 + Math.random() * size;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const out = {};

  { // Wet asphalt deck with painted lane lines and oil stains.
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#2d333d'; ctx.fillRect(0, 0, 512, 512);
    speckle(ctx, 512, 512, 5200, ['#39414c', '#232830', '#464f5b'], 3);
    ctx.fillStyle = 'rgba(12,14,18,0.35)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 46, 12 + Math.random() * 26, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(242,163,60,0.75)'; ctx.lineWidth = 5; ctx.setLineDash([26, 22]);
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(232,228,216,0.28)'; ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    out.deck = finish(c, 8);
  }

  { // Corrugated container steel, teal paint worn to rust at the ribs.
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#2a6f68'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, '#1d4f4a'); g.addColorStop(0.5, '#35837a'); g.addColorStop(1, '#1d4f4a');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, 256);
    }
    speckle(ctx, 256, 256, 900, ['#7a4a28', '#8a5a30', '#1d4f4a'], 3);
    ctx.fillStyle = 'rgba(122,74,40,0.5)';
    for (let i = 0; i < 14; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 18, 2 + Math.random() * 6);
    out.containerTeal = finish(c, 1);
  }

  { // Rust-red container steel, same ribs, different paint.
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#7a3524'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, '#572417'); g.addColorStop(0.5, '#93503a'); g.addColorStop(1, '#572417');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, 256);
    }
    speckle(ctx, 256, 256, 900, ['#3a241a', '#a06a48', '#572417'], 3);
    out.containerRust = finish(c, 1);
  }

  { // Warehouse cladding: pale panels with rivet seams.
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 1400, ['#3c454f', '#5a646e', '#333c44'], 2);
    ctx.strokeStyle = 'rgba(20,24,28,0.7)'; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (let x = 0; x <= 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    ctx.fillStyle = 'rgba(242,163,60,0.85)';
    ctx.fillRect(8, 8, 60, 10); ctx.fillRect(8, 26, 34, 10);
    out.cladding = finish(c, 2);
  }

  { // Wooden crate planks with stencilled marks.
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#6b5232'; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 42) {
      ctx.fillStyle = y % 84 === 0 ? '#755c38' : '#63492c';
      ctx.fillRect(0, y, 256, 40);
      ctx.fillStyle = 'rgba(30,20,10,0.6)'; ctx.fillRect(0, y + 40, 256, 2);
    }
    speckle(ctx, 256, 256, 700, ['#4a351d', '#8a6c44'], 2);
    ctx.strokeStyle = 'rgba(232,228,216,0.7)'; ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.font = 'bold 26px monospace'; ctx.fillStyle = 'rgba(232,228,216,0.75)';
    ctx.fillText('PIER 9', 84, 140);
    out.crate = finish(c, 1);
  }

  { // Hazard chevrons for site markings and the crane base.
    const [c, ctx] = canvas(256, 64);
    ctx.fillStyle = '#14161a'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#f2a33c';
    for (let x = -64; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 16, 64); ctx.lineTo(x + 48, 0); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, 64);
      ctx.closePath(); ctx.fill();
    }
    out.hazard = finish(c, 1);
  }

  { // Dark harbour water with faint wave streaks (scrolled slowly at render).
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#0a1622'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(53,201,184,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * 256;
      ctx.beginPath(); ctx.moveTo(Math.random() * 256, y);
      ctx.lineTo(Math.random() * 256 + 40, y + (Math.random() - 0.5) * 8); ctx.stroke();
    }
    speckle(ctx, 256, 256, 400, ['#12283a', '#06101c'], 2);
    out.water = finish(c, 6);
  }

  { // Concrete wall, stained and patched.
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#3a4048'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 2600, ['#2e343c', '#4a525c', '#242a31'], 3);
    ctx.fillStyle = 'rgba(20,24,28,0.4)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.random() * 256, 0, 8 + Math.random() * 20, 60 + Math.random() * 120);
    out.concrete = finish(c, 4);
  }

  return out;
}
