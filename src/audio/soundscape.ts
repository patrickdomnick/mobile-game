import type { AudioEventCounters } from '../wasmBridge';

const MUTE_STORAGE_KEY = 'pearl-loom-muted-v1';

// Pentatonic / Lydian degrees in semitones above root — always consonant, never dissonant
const SOLAR_SCALE_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface AudioDiagnostics {
  initialized: boolean;
  muted: boolean;
  notesScheduled: number;
}

/**
 * Zero-asset procedural Web Audio soundscape & tactile foley engine.
 * Continuously morphs harmonic warmth, filter cutoff, root pitch, and droplet cadence
 * based on real-world solar time of day (hours in [0, 24)).
 */
export class ProceduralSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padGain: GainNode | null = null;

  private muted = false;
  private timeOfDayHours = 12.0;
  private notesScheduled = 0;
  private ambientTimer: number | null = null;
  private lastEvents: AudioEventCounters | null = null;
  private melodyStep = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  getDiagnostics(): AudioDiagnostics {
    return {
      initialized: this.ctx !== null,
      muted: this.muted,
      notesScheduled: this.notesScheduled,
    };
  }

  /** Must be called from a user gesture (pointerdown / click) to unlock iOS Safari Web Audio. */
  unlock(): void {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.42;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1600;
        this.filter.Q.value = 0.7;

        this.filter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.setupWarmPad();
        this.applySolarAtmosphere(this.timeOfDayHours);
        this.scheduleNextAmbientDroplet();
      } catch {
        this.ctx = null;
        return;
      }
    }

    if (this.ctx.state === 'suspended' && !this.muted) {
      this.ctx.resume().catch(() => {});
    }
  }

  private setupWarmPad(): void {
    if (!this.ctx || !this.filter) return;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.032;

    this.padOscA = this.ctx.createOscillator();
    this.padOscB = this.ctx.createOscillator();
    this.padOscA.type = 'sine';
    this.padOscB.type = 'sine';
    this.padOscA.frequency.value = midiToHz(50); // D3
    this.padOscB.frequency.value = midiToHz(57); // A3 (warm fifth)

    this.padOscA.connect(this.padGain);
    this.padOscB.connect(this.padGain);
    this.padGain.connect(this.filter);

    this.padOscA.start();
    this.padOscB.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, now, 0.06);
      if (!muted && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
  }

  toggleMute(): boolean {
    this.unlock();
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVisibilityHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (!this.muted && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private computeSolarParams(hours: number) {
    const h = ((hours % 24) + 24) % 24;
    const sinElev = Math.sin(((h - 7.0) / 24.0) * Math.PI * 2);
    const daylight = smoothstep(-0.38, 0.48, sinElev);
    const horizonWarmth = Math.exp(-Math.pow((sinElev - 0.04) / 0.34, 2));

    // Smooth root pitch drift: C4 (60) at cozy midnight -> D4 (62) at sunlit noon
    const rootMidi = lerp(60, 62, daylight);
    // Lowpass warmth: 760 Hz lullaby felt-tone at night -> 2400 Hz airy morning/noon sparkle
    const cutoffHz = lerp(760, 2400, daylight) - horizonWarmth * 350;
    // Ambient droplet spacing: slower at night (3.6s), breezier in daylight (2.1s)
    const intervalMs = lerp(3600, 2100, daylight);

    return { daylight, horizonWarmth, rootMidi, cutoffHz, intervalMs };
  }

  /** Continuously glides filter warmth and ambient pad pitch with the real-world clock. */
  applySolarAtmosphere(hours: number): void {
    this.timeOfDayHours = hours;
    if (!this.ctx || !this.filter || !this.padOscA || !this.padOscB) return;

    const { rootMidi, cutoffHz, daylight } = this.computeSolarParams(hours);
    const now = this.ctx.currentTime;

    this.filter.frequency.setTargetAtTime(Math.max(550, cutoffHz), now, 0.4);
    this.padOscA.frequency.setTargetAtTime(midiToHz(rootMidi - 12), now, 0.6);
    this.padOscB.frequency.setTargetAtTime(midiToHz(rootMidi - 5), now, 0.6);
    if (this.padGain) {
      this.padGain.gain.setTargetAtTime(lerp(0.024, 0.036, daylight), now, 0.5);
    }
  }

  private playTone(
    freqHz: number,
    durationSec: number,
    peakGain: number,
    oscType: OscillatorType = 'sine',
    delaySec = 0,
    attackSec = 0.014,
  ): void {
    if (!this.ctx || !this.filter) return;
    const start = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = oscType;
    osc.frequency.setValueAtTime(freqHz, start);

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peakGain, start + attackSec);
    env.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(env);
    env.connect(this.filter);

    osc.start(start);
    osc.stop(start + durationSec + 0.04);
    this.notesScheduled++;
  }

  private scheduleNextAmbientDroplet(): void {
    if (this.ambientTimer !== null) {
      window.clearTimeout(this.ambientTimer);
    }
    const { intervalMs, rootMidi, daylight } = this.computeSolarParams(this.timeOfDayHours);
    const jitter = (Math.sin(this.melodyStep * 1.618) * 0.5 + 0.5) * 900;

    this.ambientTimer = window.setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running' && !this.muted) {
        const deg = SOLAR_SCALE_SEMITONES[this.melodyStep % SOLAR_SCALE_SEMITONES.length];
        const freq = midiToHz(rootMidi + deg);
        const type: OscillatorType = daylight > 0.55 ? 'triangle' : 'sine';
        this.playTone(freq, lerp(3.4, 2.2, daylight), 0.048, type, 0, 0.045);
        this.melodyStep = (this.melodyStep + 2) % SOLAR_SCALE_SEMITONES.length;
      }
      this.scheduleNextAmbientDroplet();
    }, intervalMs + jitter);
  }

  /** Consumes WASM simulation event counters and plays harmonious procedural foley. */
  syncEvents(events: AudioEventCounters): void {
    if (!this.lastEvents) {
      this.lastEvents = { ...events };
      return;
    }

    const prev = this.lastEvents;
    this.lastEvents = { ...events };

    if (!this.ctx || this.muted) return;

    const { rootMidi, daylight } = this.computeSolarParams(this.timeOfDayHours);

    if (events.completeEvents > prev.completeEvents) {
      // Luminous ascending harp/celesta completion bloom
      const chord = [0, 4, 7, 12, 16];
      chord.forEach((semi, idx) => {
        this.playTone(midiToHz(rootMidi + semi), 1.8, 0.11, 'sine', idx * 0.085, 0.015);
        this.playTone(midiToHz(rootMidi + semi + 12), 1.2, 0.035, 'triangle', idx * 0.085 + 0.01, 0.01);
      });
      return;
    }

    if (events.stitchEvents > prev.stitchEvents) {
      // Porcelain-and-pearl harmonic chime tuned to the stitched pearl's color
      const semi = SOLAR_SCALE_SEMITONES[events.lastStitchColor % SOLAR_SCALE_SEMITONES.length];
      const baseHz = midiToHz(rootMidi + semi);
      this.playTone(baseHz, 0.85, 0.14, 'sine', 0, 0.008);
      this.playTone(baseHz * 2.0, 0.42, lerp(0.025, 0.055, daylight), 'triangle', 0.006, 0.006);
    }

    if (events.trayEvents > prev.trayEvents) {
      // Soft porcelain dimple tap
      const freq = midiToHz(rootMidi - 5);
      this.playTone(freq, 0.24, 0.09, 'triangle', 0, 0.006);
    }

    if (events.blockedEvents > prev.blockedEvents) {
      // Warm gentle wood knock (non-punishing tactile feedback)
      if (this.ctx && this.filter) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(132, now + 0.065);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.09, now + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(env);
        env.connect(this.filter);
        osc.start(now);
        osc.stop(now + 0.09);
        this.notesScheduled++;
      }
    }

    if (events.undoEvents > prev.undoEvents) {
      // Soft descending two-note sigh
      this.playTone(midiToHz(rootMidi + 4), 0.22, 0.075, 'sine', 0, 0.008);
      this.playTone(midiToHz(rootMidi), 0.28, 0.065, 'sine', 0.065, 0.008);
    }
  }
}
