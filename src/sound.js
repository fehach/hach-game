// Tiny sound engine that synthesizes effects with the Web Audio API, so we
// don't need any audio files. Call sfx.resume() from a user click first
// (browsers block audio until the player interacts).

// Maps each block type to the "flavor" of break/place sound it should make.
const BLOCK_SOUNDS = {
  stone: { type: 'hard', freq: 1600, dur: 0.16 },
  sand: { type: 'soft', freq: 360, dur: 0.14 },
  snow: { type: 'soft', freq: 300, dur: 0.16 },
  wood: { type: 'knock', freq: 220, dur: 0.16 },
  leaves: { type: 'rustle', freq: 4000, dur: 0.12 },
  water: { type: 'splash', freq: 500, dur: 0.18 },
  grass: { type: 'dirt', freq: 700, dur: 0.18 },
  dirt: { type: 'dirt', freq: 600, dur: 0.18 },
};

const DEFAULT_VOLUME = 0.7;

class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = DEFAULT_VOLUME;
  }

  // Create / unlock the audio context. Safe to call many times.
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Master volume from 0 (silent) to 1 (full).
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  _out() {
    return this.master || this.ctx.destination;
  }

  _tone({ freq = 200, type = 'sine', duration = 0.15, gain = 0.2, slideTo = null }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);

    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env).connect(this._out());
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  // Short burst of filtered noise — used for digs, footsteps, etc.
  _noise({ duration = 0.18, gain = 0.25, freq = 800, filterType = 'lowpass' }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames); // decaying noise
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(env).connect(this._out());
    src.start(t0);
  }

  // Break a block — the sound depends on the material.
  break(blockId) {
    const s = BLOCK_SOUNDS[blockId] || BLOCK_SOUNDS.dirt;
    switch (s.type) {
      case 'hard':
        this._noise({ duration: s.dur, gain: 0.3, freq: s.freq, filterType: 'highpass' });
        break;
      case 'rustle':
        this._noise({ duration: s.dur, gain: 0.18, freq: s.freq, filterType: 'highpass' });
        break;
      case 'knock':
        this._tone({ freq: s.freq, type: 'square', duration: s.dur, gain: 0.16, slideTo: s.freq * 0.6 });
        this._noise({ duration: s.dur * 0.6, gain: 0.12, freq: 1200 });
        break;
      case 'splash':
        this._noise({ duration: s.dur, gain: 0.2, freq: s.freq });
        break;
      case 'soft':
        this._noise({ duration: s.dur, gain: 0.2, freq: s.freq });
        break;
      default:
        this._noise({ duration: s.dur, gain: 0.28, freq: s.freq });
    }
  }

  // Place a block — a quick pop pitched by material.
  place(blockId) {
    const s = BLOCK_SOUNDS[blockId] || BLOCK_SOUNDS.dirt;
    const base = s.type === 'hard' ? 300 : s.type === 'knock' ? 200 : 240;
    this._tone({ freq: base, type: 'square', duration: 0.1, gain: 0.14, slideTo: base * 1.5 });
  }

  // Soft footstep, varies by the block walked on.
  step(blockId) {
    const s = BLOCK_SOUNDS[blockId] || BLOCK_SOUNDS.dirt;
    const jitter = 0.85 + Math.random() * 0.3;
    this._noise({ duration: 0.07, gain: 0.08, freq: (s.freq || 600) * jitter });
  }

  // Thud when landing from a fall.
  land() {
    this._noise({ duration: 0.12, gain: 0.18, freq: 200 });
  }

  jump() {
    this._tone({ freq: 300, type: 'sine', duration: 0.16, gain: 0.1, slideTo: 600 });
  }

  click() {
    this._tone({ freq: 660, type: 'triangle', duration: 0.06, gain: 0.12 });
  }

  save() {
    this._tone({ freq: 523, type: 'triangle', duration: 0.12, gain: 0.18, slideTo: 784 });
  }
}

export const sfx = new Sound();
