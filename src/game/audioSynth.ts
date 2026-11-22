class DrivingAudioSynth {
  private ctx: AudioContext | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private rainNoiseNode: AudioNode | null = null;
  private rainGain: GainNode | null = null;
  private muted = false;
  private running = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(mute ? 0 : 0.045, this.ctx.currentTime, 0.05);
    }
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(mute ? 0 : 0.025, this.ctx.currentTime, 0.08);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public startEngine(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.running) return;
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.value = 48;
      osc2.frequency.value = 96;

      filter.type = 'lowpass';
      filter.frequency.value = 260;

      gain.gain.value = this.muted ? 0 : 0.04;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineGain = gain;

      // Rain ambience filtered white noise
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 950;
      rainFilter.Q.value = 0.7;

      const rGain = ctx.createGain();
      rGain.gain.value = 0;

      whiteNoise.connect(rainFilter);
      rainFilter.connect(rGain);
      rGain.connect(ctx.destination);
      whiteNoise.start();

      this.rainNoiseNode = whiteNoise;
      this.rainGain = rGain;
      this.running = true;
    } catch {
      // Ignore audio errors on blocked autoplay
    }
  }

  public updateEngine(rpm: number, throttle: number, isNightRain: boolean, paused: boolean): void {
    if (!this.ctx || !this.running || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain) return;
    const now = this.ctx.currentTime;
    if (paused || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.04);
      if (this.rainGain) this.rainGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const baseFreq = 36 + (rpm / 7200) * 145;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);

    const targetGain = 0.025 + throttle * 0.032 + (rpm / 7200) * 0.02;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(isNightRain ? 0.024 : 0, now, 0.15);
    }
  }

  public playGearShift(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const pitchJitter = 0.94 + Math.random() * 0.12;
      osc.frequency.setValueAtTime(180 * pitchJitter, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(115 * pitchJitter, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }

  public playWiperTick(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }

  public playCollisionImpact(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch {}
  }

  public playCheckpointChime(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [587.33, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.045, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.19);
      });
    } catch {}
  }
}

export const audioSynth = new DrivingAudioSynth();
