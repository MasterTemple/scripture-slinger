/** Tiny synthesized sound effects; no audio files needed. */
export class AudioFX {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shoot(index: number) {
    this.tone(520 + (index % 6) * 45, 0.07, 'triangle', 0.08, 260);
  }

  hit() {
    this.tone(150, 0.08, 'square', 0.035, 70);
  }

  kill() {
    this.tone(523, 0.14, 'triangle', 0.09);
    this.tone(784, 0.22, 'triangle', 0.07, undefined, 0.06);
  }

  miss() {
    this.tone(110, 0.16, 'sawtooth', 0.05, 80);
  }

  release() {
    this.tone(330, 0.12, 'sine', 0.05, 200);
  }

  hurt() {
    this.tone(220, 0.5, 'sawtooth', 0.12, 45);
  }

  wave() {
    [392, 494, 587].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.07, undefined, i * 0.12));
  }

  shofar() {
    this.tone(233, 0.25, 'sawtooth', 0.09, 349);
    this.tone(349, 1.1, 'sawtooth', 0.1, 340, 0.22);
    this.tone(175, 1.1, 'triangle', 0.08, 170, 0.22);
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, undefined, i * 0.22));
  }
}
