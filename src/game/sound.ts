import { SimEvent } from './types.ts';

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlocked = false;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted || !this.unlocked || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  public unlockFromGesture(): void {
    this.unlocked = true;
    this.ensureContext();
  }

  public unlock(): void {
    if (this.unlocked) {
      this.ensureContext();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.08,
    delay = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private noise(duration: number, lowpassHz: number, volume = 0.12): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpassHz, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public playStageStart(): void {
    // Iconic Battle City style martial 8-bit fanfare
    const notes: [number, number, number][] = [
      [262, 0.0, 0.11],
      [330, 0.12, 0.11],
      [392, 0.24, 0.11],
      [523, 0.36, 0.22],
      [392, 0.6, 0.11],
      [523, 0.72, 0.34],
    ];
    for (const [freq, delay, dur] of notes) {
      this.tone(freq, freq, dur, 'square', 0.07, delay);
      this.tone(freq * 0.5, freq * 0.5, dur, 'triangle', 0.06, delay);
    }
  }

  public playShoot(): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.tone(540 * jitter, 140 * jitter, 0.085, 'square', 0.065);
  }

  public playBrickHit(): void {
    this.noise(0.07, 1400, 0.08);
    this.tone(190, 90, 0.06, 'triangle', 0.06);
  }

  public playSteelHit(): void {
    this.tone(1080, 740, 0.06, 'square', 0.055);
  }

  public playArmorHit(): void {
    this.tone(420, 260, 0.08, 'sawtooth', 0.07);
  }

  public playExplosion(heavy = false): void {
    this.noise(heavy ? 0.38 : 0.22, heavy ? 850 : 1200, heavy ? 0.18 : 0.12);
    this.tone(heavy ? 120 : 170, 36, heavy ? 0.34 : 0.2, 'sawtooth', heavy ? 0.11 : 0.08);
  }

  public playPowerUp(): void {
    const freqs = [523, 659, 784, 1046];
    freqs.forEach((f, idx) => this.tone(f, f, 0.075, 'square', 0.065, idx * 0.055));
  }

  public playExtraLife(): void {
    const freqs = [659, 784, 1318, 1046, 1175, 1568];
    freqs.forEach((f, idx) => this.tone(f, f, 0.09, 'square', 0.075, idx * 0.07));
  }

  public playStageClear(): void {
    const freqs = [392, 494, 587, 784, 988];
    freqs.forEach((f, idx) => this.tone(f, f, 0.13, 'square', 0.075, idx * 0.09));
  }

  public playGameOver(): void {
    const freqs = [392, 349, 311, 262, 196];
    freqs.forEach((f, idx) => this.tone(f, f * 0.94, 0.18, 'sawtooth', 0.08, idx * 0.15));
  }

  public playEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          this.playShoot();
          break;
        case 'brick_hit':
          this.playBrickHit();
          break;
        case 'steel_hit':
          this.playSteelHit();
          break;
        case 'armor_hit':
          this.playArmorHit();
          break;
        case 'tank_explode':
        case 'player_explode':
        case 'eagle_explode':
          this.playExplosion(Boolean(ev.heavy));
          break;
        case 'powerup_pickup':
          this.playPowerUp();
          break;
        case 'extra_life':
          this.playExtraLife();
          break;
        case 'stage_clear':
          this.playStageClear();
          break;
        case 'game_over':
          this.playGameOver();
          break;
        default:
          break;
      }
    }
  }
}

export const soundEngine = new ArcadeSoundEngine();
