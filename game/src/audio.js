// audio.js — procedural WebAudio only. Every sound is synthesized at play
// time: no audio files, no network. All calls are safe before the first user
// gesture (the context is created lazily and sounds are skipped until then).
export class AudioBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  _noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = 0, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // volume 0..1 scales with distance for enemy fire.
  shot(kind, volume = 1) {
    if (kind === 'longshot') { this._noise(0.22, 900, 0.5 * volume); this._tone(140, 0.18, 0.35 * volume, 'sine', 55); }
    else if (kind === 'squall') { this._noise(0.09, 2400, 0.32 * volume); this._tone(190, 0.07, 0.2 * volume, 'square', 90); }
    else if (kind === 'gull') { this._noise(0.1, 1800, 0.3 * volume); this._tone(160, 0.09, 0.22 * volume, 'square', 80); }
    else { this._noise(0.13, 1500, 0.4 * volume); this._tone(150, 0.1, 0.28 * volume, 'sawtooth', 70); }
  }

  dryFire() { this._tone(900, 0.04, 0.12, 'square'); }
  reload() { this._tone(500, 0.05, 0.15, 'square'); this._tone(340, 0.05, 0.15, 'square', 0, 0.18); this._tone(620, 0.06, 0.18, 'square', 0, 0.55); }
  hit(head = false) { this._tone(head ? 1320 : 980, 0.06, 0.22, 'sine'); }
  hurt() { this._tone(110, 0.16, 0.3, 'sawtooth', 60); this._noise(0.12, 500, 0.2); }
  step() { this._noise(0.05, 320, 0.07); }
  plantBeep(final = false) { this._tone(final ? 1500 : 1050, final ? 0.22 : 0.09, 0.22, 'sine'); }
  explosion() {
    this._noise(0.9, 300, 0.9); this._tone(70, 0.8, 0.6, 'sine', 28);
    this._noise(0.4, 3000, 0.3, 'highpass');
  }
  roundWin() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.22, 0.22, 'triangle', 0, i * 0.11)); }
  roundLose() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.26, 0.22, 'triangle', 0, i * 0.13)); }
  buy() { this._tone(880, 0.08, 0.18, 'sine'); this._tone(1174, 0.1, 0.18, 'sine', 0, 0.08); }
  denied() { this._tone(220, 0.12, 0.2, 'square'); }
  throwWhoosh() { this._noise(0.25, 900, 0.2, 'bandpass'); }
  bounce() { this._tone(300, 0.05, 0.12, 'sine', 180); }
}
