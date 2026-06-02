// Tiny sound engine that synthesizes effects with the Web Audio API, so we
// don't need any audio files. Call sfx.resume() from a user click first
// (browsers block audio until the player interacts).

class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Create / unlock the audio context. Safe to call many times.
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
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

    osc.connect(env).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  // Short burst of filtered noise — a chunky "dig" sound.
  _noise({ duration = 0.18, gain = 0.25, freq = 800 }) {
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
    filter.type = 'lowpass';
    filter.frequency.value = freq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(env).connect(this.ctx.destination);
    src.start(t0);
  }

  break() {
    this._noise({ duration: 0.2, gain: 0.3, freq: 600 });
  }

  place() {
    this._tone({ freq: 220, type: 'square', duration: 0.12, gain: 0.15, slideTo: 330 });
  }

  jump() {
    this._tone({ freq: 300, type: 'sine', duration: 0.16, gain: 0.12, slideTo: 600 });
  }

  save() {
    this._tone({ freq: 523, type: 'triangle', duration: 0.12, gain: 0.18, slideTo: 784 });
  }
}

export const sfx = new Sound();
