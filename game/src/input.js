// input.js — keyboard + mouse state, pointer lock, and the per-frame look
// deltas. The sim polls this; nothing here moves the player directly.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // consumed by the sim each tick
    this.locked = false;
    this.onLockChange = null;
    this.onKey = null; // (code, down) for menu keys the sim handles
    this.onClick = null; // UI clicks (play button etc.)

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        if (this.onKey) this.onKey(e.code, true);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      if (!this.locked && this.onClick) this.onClick();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
  }

  lock() {
    try { this.canvas.requestPointerLock(); } catch { /* headless or denied */ }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }

  // Movement axes in -1..1, from WASD + arrows.
  moveAxes() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }

  consumeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }
}
