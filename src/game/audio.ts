export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  muted = false;
  private noise: AudioBuffer | null = null;

  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.7;
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.sfx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(1);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }
  }

  shot(sniper: boolean) {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.burst(sniper ? 0.18 : 0.07, sniper ? 0.55 : 0.28, sniper ? 90 : 180, sniper ? 0.7 : 1.1);
    this.tone(sniper ? 90 : 220, sniper ? 40 : 80, sniper ? 0.12 : 0.05, sniper ? 0.35 : 0.18, t);
  }

  hit() {
    this.tone(740, 180, 0.05, 0.16, this.ctx?.currentTime ?? 0);
    this.burst(0.04, 0.18, 400, 1.4);
  }

  headshot() {
    this.tone(1180, 420, 0.08, 0.2, this.ctx?.currentTime ?? 0);
  }

  empty() {
    this.tone(140, 90, 0.04, 0.08, this.ctx?.currentTime ?? 0);
  }

  reload() {
    this.tone(220, 140, 0.08, 0.1, this.ctx?.currentTime ?? 0);
    this.tone(180, 120, 0.06, 0.08, (this.ctx?.currentTime ?? 0) + 0.12);
  }

  foot(sprint: boolean) {
    this.burst(sprint ? 0.04 : 0.03, sprint ? 0.08 : 0.05, 80, 0.6);
  }

  alarm() {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(880, 620, 0.18, 0.12, t);
    this.tone(660, 480, 0.18, 0.12, t + 0.2);
  }

  pickup() {
    this.tone(520, 880, 0.12, 0.16, this.ctx?.currentTime ?? 0);
  }

  takedown() {
    this.burst(0.12, 0.22, 70, 0.5);
    this.tone(90, 40, 0.16, 0.22, this.ctx?.currentTime ?? 0);
  }

  hurt() {
    this.burst(0.1, 0.3, 60, 0.4);
  }

  win() {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(392, 392, 0.12, 0.12, t);
    this.tone(523, 523, 0.16, 0.14, t + 0.12);
    this.tone(659, 784, 0.28, 0.16, t + 0.26);
  }

  lose() {
    this.tone(220, 80, 0.4, 0.2, this.ctx?.currentTime ?? 0);
  }

  private burst(dur: number, gain: number, hp: number, rate: number) {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  private tone(f0: number, f1: number, dur: number, gain: number, t: number) {
    if (!this.ctx || !this.sfx) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private makeNoise(seconds: number) {
    if (!this.ctx) return null;
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
