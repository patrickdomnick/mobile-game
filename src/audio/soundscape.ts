import type { AudioEventCounters } from '../wasmBridge';

const MUTE_STORAGE_KEY = 'pearl-loom-muted-v1';

// Pentatonic / Lydian degrees in semitones above root — always consonant, climbs dramatically with streak!
const SOLAR_SCALE_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];

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

export interface SyncAudioContext {
  streak: number;
  trayTension: number;
  hapticsEnabled: boolean;
}

let iosHapticLabel: HTMLLabelElement | null = null;

function triggerIosSwitchHaptic(): void {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    if (!iosHapticLabel) {
      const id = 'pearl-loom-ios-haptic-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      input.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;padding:0;';

      const label = document.createElement('label');
      label.htmlFor = id;
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

      document.body.append(input, label);
      iosHapticLabel = label;
    }
    iosHapticLabel.click();
  } catch {
    // Non-fatal fallback
  }
}

function vibratePattern(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (navigator.vibrate(pattern)) {
        return;
      }
    }
  } catch {
    // Fall through to iOS Safari switch haptic
  }
  // iOS Safari 17.4+/18+/26+ does not implement navigator.vibrate,
  // but toggling a hidden native <input type="checkbox" switch> synchronously
  // inside a user gesture triggers a real iPhone Taptic Engine click!
  triggerIosSwitchHaptic();
}

/**
 * Zero-asset procedural Web Audio soundscape & Balatro/Vampire-Survivors tactile foley engine.
 * - Continuously morphs harmonic warmth & pitch across the 24-hour real-world solar cycle.
 * - Escalates pitch & crystalline overtones on consecutive Direct-Stitch streaks!
 * - Plays celebratory swells on Color Clear, Layer/Ring Complete, and Pattern Completion.
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
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.44;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1800;
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
    this.padGain.gain.value = 0.028;

    this.padOscA = this.ctx.createOscillator();
    this.padOscB = this.ctx.createOscillator();
    this.padOscA.type = 'sine';
    this.padOscB.type = 'sine';
    this.padOscA.frequency.value = midiToHz(50);
    this.padOscB.frequency.value = midiToHz(57);

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
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.44, now, 0.06);
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
    const daylight = smoothstep(-0.36, 0.46, sinElev);
    const horizonWarmth = Math.exp(-Math.pow((sinElev - 0.02) / 0.30, 2));

    const rootMidi = lerp(60, 62, daylight);
    const cutoffHz = lerp(880, 2800, daylight) - horizonWarmth * 300;
    const intervalMs = lerp(3800, 2200, daylight);

    return { daylight, horizonWarmth, rootMidi, cutoffHz, intervalMs };
  }

  applySolarAtmosphere(hours: number): void {
    this.timeOfDayHours = hours;
    if (!this.ctx || !this.filter || !this.padOscA || !this.padOscB) return;

    const { rootMidi, cutoffHz, daylight } = this.computeSolarParams(hours);
    const now = this.ctx.currentTime;

    this.filter.frequency.setTargetAtTime(Math.max(620, cutoffHz), now, 0.4);
    this.padOscA.frequency.setTargetAtTime(midiToHz(rootMidi - 12), now, 0.6);
    this.padOscB.frequency.setTargetAtTime(midiToHz(rootMidi - 5), now, 0.6);
    if (this.padGain) {
      this.padGain.gain.setTargetAtTime(lerp(0.020, 0.032, daylight), now, 0.5);
    }
  }

  private playTone(
    freqHz: number,
    durationSec: number,
    peakGain: number,
    oscType: OscillatorType = 'sine',
    delaySec = 0,
    attackSec = 0.012,
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

  playUiTap(hapticsEnabled: boolean): void {
    vibratePattern(hapticsEnabled, 8);
    if (!this.ctx || this.muted) return;
    const { rootMidi } = this.computeSolarParams(this.timeOfDayHours);
    this.playTone(midiToHz(rootMidi + 12), 0.12, 0.06, 'sine', 0, 0.005);
  }

  private scheduleNextAmbientDroplet(): void {
    if (this.ambientTimer !== null) {
      window.clearTimeout(this.ambientTimer);
    }
    const { intervalMs, rootMidi, daylight } = this.computeSolarParams(this.timeOfDayHours);
    const jitter = (Math.sin(this.melodyStep * 1.618) * 0.5 + 0.5) * 900;

    this.ambientTimer = window.setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running' && !this.muted) {
        const deg = SOLAR_SCALE_SEMITONES[this.melodyStep % 7];
        const freq = midiToHz(rootMidi + deg);
        const type: OscillatorType = daylight > 0.55 ? 'triangle' : 'sine';
        this.playTone(freq, lerp(3.4, 2.2, daylight), 0.04, type, 0, 0.045);
        this.melodyStep = (this.melodyStep + 2) % 7;
      }
      this.scheduleNextAmbientDroplet();
    }, intervalMs + jitter);
  }

  /** Consumes WASM simulation event counters and plays Balatro/VS escalating foley & haptics. */
  syncEvents(events: AudioEventCounters, info: SyncAudioContext): void {
    if (!this.lastEvents) {
      this.lastEvents = { ...events };
      return;
    }

    const prev = this.lastEvents;
    this.lastEvents = { ...events };

    const { rootMidi, daylight } = this.computeSolarParams(this.timeOfDayHours);

    if (events.completeEvents > prev.completeEvents) {
      vibratePattern(info.hapticsEnabled, [24, 40, 32, 40, 65]);
      if (this.ctx && !this.muted) {
        const chord = [0, 4, 7, 11, 12, 16, 19];
        chord.forEach((semi, idx) => {
          this.playTone(midiToHz(rootMidi + semi), 2.0, 0.12, 'sine', idx * 0.075, 0.012);
          this.playTone(midiToHz(rootMidi + semi + 12), 1.3, 0.045, 'triangle', idx * 0.075 + 0.01, 0.008);
        });
      }
      return;
    }

    if (events.layerClearEvents > prev.layerClearEvents) {
      // Vampire Survivors / Nintendo triumphant golden ring milestone arpeggio!
      vibratePattern(info.hapticsEnabled, [18, 28, 36]);
      if (this.ctx && !this.muted) {
        [0, 7, 12, 16, 19].forEach((semi, idx) => {
          this.playTone(midiToHz(rootMidi + semi), 1.1, 0.11, 'triangle', idx * 0.055, 0.008);
        });
      }
    }

    if (events.colorClearEvents > prev.colorClearEvents) {
      // Balatro Color Clear punchy harmonic burst!
      vibratePattern(info.hapticsEnabled, [14, 22, 24]);
      if (this.ctx && !this.muted) {
        [4, 7, 11, 16].forEach((semi, idx) => {
          this.playTone(midiToHz(rootMidi + semi), 0.78, 0.115, 'sine', idx * 0.045, 0.006);
        });
      }
    }

    if (events.stitchEvents > prev.stitchEvents) {
      // Balatro-style RISING PITCH with Clean Direct-Stitch Streak!
      const streakStep = Math.min(Math.max(0, info.streak - 1), SOLAR_SCALE_SEMITONES.length - 1);
      const semi = SOLAR_SCALE_SEMITONES[streakStep];
      vibratePattern(info.hapticsEnabled, Math.min(22, 9 + streakStep));
      if (this.ctx && !this.muted) {
        const baseHz = midiToHz(rootMidi + semi);
        this.playTone(baseHz, 0.72, 0.145, 'sine', 0, 0.006);
        this.playTone(baseHz * 2.0, 0.36, lerp(0.032, 0.075, clamp01(daylight * 0.6 + streakStep * 0.06)), 'triangle', 0.005, 0.005);
        if (info.streak >= 5) {
          // Sparkling fifth harmonic shimmer on high streaks!
          this.playTone(baseHz * 1.5, 0.45, 0.048, 'sine', 0.025, 0.008);
        }
      }
    }

    if (events.trayEvents > prev.trayEvents) {
      vibratePattern(info.hapticsEnabled, info.trayTension >= 0.7 ? [14, 24, 14] : 10);
      if (this.ctx && !this.muted) {
        // Subtle tension undertone as tray approaches full (4/5 or 5/5)
        const base = midiToHz(rootMidi - 5);
        this.playTone(base, 0.24, 0.095, 'triangle', 0, 0.006);
        if (info.trayTension >= 0.65) {
          this.playTone(midiToHz(rootMidi - 12), 0.38, 0.085, 'sine', 0.02, 0.01);
        }
      }
    }

    if (events.blockedEvents > prev.blockedEvents) {
      // Crisp causal collision double-knock (clearly communicates "blocked by another tile!")
      vibratePattern(info.hapticsEnabled, [14, 26, 10]);
      if (this.ctx && this.filter && !this.muted) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(118, now + 0.075);
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.11, now + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        osc.connect(env);
        env.connect(this.filter);
        osc.start(now);
        osc.stop(now + 0.1);
        this.notesScheduled++;
      }
    }

    if (events.undoEvents > prev.undoEvents) {
      vibratePattern(info.hapticsEnabled, 8);
      if (this.ctx && !this.muted) {
        this.playTone(midiToHz(rootMidi + 4), 0.2, 0.075, 'sine', 0, 0.008);
        this.playTone(midiToHz(rootMidi), 0.26, 0.065, 'sine', 0.06, 0.008);
      }
    }
  }
}
