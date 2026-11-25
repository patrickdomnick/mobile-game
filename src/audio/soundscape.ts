import type { AudioEventCounters } from '../wasmBridge';

const MUTE_STORAGE_KEY = 'pearl-loom-muted-v1';

// Pentatonic / Lydian degrees in semitones above root — always consonant, climbs dramatically with streak!
const SOLAR_SCALE_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];

// Tiny 1-sample silent PCM WAV data URI used to wake iOS CoreAudio playback route on user gestures
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: {
    type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
  };
}

function configureIosAudioSession(): void {
  try {
    const nav = navigator as NavigatorWithAudioSession;
    if (nav.audioSession && nav.audioSession.type !== 'playback') {
      // Safari 17+ / iOS 17-26 Audio Session API: ensures game chimes play reliably
      // even when the iPhone hardware Silent switch / Action Button is on!
      nav.audioSession.type = 'playback';
    }
  } catch {
    // Non-fatal on browsers without navigator.audioSession
  }
}

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
  state?: string;
}

export interface SyncAudioContext {
  streak: number;
  trayTension: number;
  hapticsEnabled: boolean;
}

/**
 * Triggers Android Chrome/Edge hardware vibration patterns.
 * On iOS 26.5+ Safari, native Taptic Engine clicks are delivered by direct-tap
 * transparent `<label for="ios-haptic-switch">` overlays on the board and buttons.
 */
function vibratePattern(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Non-fatal on browsers without Vibration API
  }
}

/**
 * Zero-asset procedural Web Audio soundscape & Balatro/Vampire-Survivors tactile foley engine.
 * - Uses `navigator.audioSession.type = 'playback'` so audio works reliably on iPhone even in Silent Mode.
 * - Handles BOTH `'suspended'` and WebKit's `'interrupted'` AudioContext states across app switches.
 * - Includes a frozen-`currentTime` watchdog (WebKit Bug #263627) + CoreAudio silent-WAV route kick
 *   so audio self-heals automatically on tap without ever requiring reloads or volume-button nudges.
 */
export class ProceduralSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private silentEl: HTMLAudioElement | null = null;

  private muted = false;
  private timeOfDayHours = 12.0;
  private notesScheduled = 0;
  private ambientTimer: number | null = null;
  private lastEvents: AudioEventCounters | null = null;
  private melodyStep = 0;

  // Watchdog state to detect iOS WebKit frozen AudioContext.currentTime (Bug #263627)
  private lastObservedAudioTime = -1;
  private lastObservedWallMs = 0;
  private needsRouteKick = true;
  private recovering = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
    configureIosAudioSession();
  }

  isMuted(): boolean {
    return this.muted;
  }

  getDiagnostics(): AudioDiagnostics {
    return {
      initialized: this.ctx !== null,
      muted: this.muted,
      notesScheduled: this.notesScheduled,
      state: this.ctx ? this.ctx.state : 'uninitialized',
    };
  }

  private createAudioGraph(): boolean {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      configureIosAudioSession();
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.44;

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1800;
      this.filter.Q.value = 0.7;

      this.filter.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      this.setupWarmPad();
      this.applySolarAtmosphere(this.timeOfDayHours);

      ctx.onstatechange = () => {
        if (!this.ctx || this.ctx !== ctx) return;
        const st = ctx.state as string;
        if (st === 'interrupted' || st === 'suspended') {
          this.needsRouteKick = true;
          if (!this.muted && document.visibilityState === 'visible') {
            ctx.resume().catch(() => {});
          }
        }
      };

      this.lastObservedAudioTime = ctx.currentTime;
      this.lastObservedWallMs = performance.now();
      this.scheduleNextAmbientDroplet();
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  private tearDownAudioGraph(): void {
    try {
      this.padOscA?.stop();
    } catch {
      // ignore
    }
    try {
      this.padOscB?.stop();
    } catch {
      // ignore
    }
    try {
      this.ctx?.close().catch(() => {});
    } catch {
      // ignore
    }
    this.padOscA = null;
    this.padOscB = null;
    this.padGain = null;
    this.filter = null;
    this.masterGain = null;
    this.ctx = null;
  }

  private kickCoreAudioRoute(): void {
    // 1. Play 1-sample silent buffer directly inside user gesture to wake Web Audio render thread
    if (this.ctx) {
      try {
        const buf = this.ctx.createBuffer(1, 1, Math.max(22050, this.ctx.sampleRate || 44100));
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch {
        // non-fatal
      }
    }

    // 2. Tiny silent HTMLAudioElement kick reliably attaches iOS CoreAudio playback route
    try {
      if (!this.silentEl && typeof Audio !== 'undefined') {
        const el = new Audio(SILENT_WAV_DATA_URI);
        el.setAttribute('playsinline', '');
        el.preload = 'auto';
        el.volume = 0.01;
        this.silentEl = el;
      }
      if (this.silentEl) {
        this.silentEl.currentTime = 0;
        const p = this.silentEl.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      // non-fatal
    }
    this.needsRouteKick = false;
  }

  /**
   * Must be called synchronously from a user gesture (pointerdown / touchend / click).
   * Unlocks, resumes `'suspended'` OR `'interrupted'` contexts, and self-heals frozen iOS audio clocks.
   */
  unlock(): void {
    configureIosAudioSession();

    if (!this.ctx) {
      if (!this.createAudioGraph()) return;
    }
    if (!this.ctx) return;

    const st = this.ctx.state as string;
    if (st === 'closed') {
      this.tearDownAudioGraph();
      if (!this.createAudioGraph()) return;
    }

    if (!this.muted) {
      const stateNow = this.ctx.state as string;
      if (stateNow !== 'running') {
        // Handles BOTH 'suspended' AND WebKit's 'interrupted' state!
        this.ctx.resume().catch(() => {});
        this.kickCoreAudioRoute();
      } else {
        // Watchdog for WebKit Bug #263627: state says 'running' while currentTime is frozen
        const nowMs = performance.now();
        const curAudioT = this.ctx.currentTime;
        if (
          this.lastObservedAudioTime >= 0 &&
          nowMs - this.lastObservedWallMs > 450 &&
          curAudioT - this.lastObservedAudioTime < 0.005
        ) {
          this.recoverFrozenContext();
        } else {
          this.lastObservedAudioTime = curAudioT;
          this.lastObservedWallMs = nowMs;
          if (this.needsRouteKick) {
            this.kickCoreAudioRoute();
          }
        }
      }
    }
  }

  private recoverFrozenContext(): void {
    if (this.recovering || !this.ctx) return;
    this.recovering = true;
    const oldCtx = this.ctx;
    const frozenTime = oldCtx.currentTime;

    this.kickCoreAudioRoute();
    oldCtx
      .suspend()
      .catch(() => {})
      .then(() => oldCtx.resume().catch(() => {}))
      .finally(() => {
        window.setTimeout(() => {
          this.recovering = false;
          if (!this.ctx || this.ctx !== oldCtx || this.muted) return;
          if (this.ctx.currentTime - frozenTime < 0.005) {
            // Hard rebuild if WebKit audio render thread stayed wedged
            this.tearDownAudioGraph();
            if (this.createAudioGraph() && this.ctx) {
              this.ctx.resume().catch(() => {});
              this.kickCoreAudioRoute();
            }
          } else {
            this.lastObservedAudioTime = this.ctx.currentTime;
            this.lastObservedWallMs = performance.now();
          }
        }, 180);
      });
  }

  /** Called on pageshow / focus / foreground visibility return to immediately heal iOS audio. */
  handleForegroundResume(): void {
    this.needsRouteKick = true;
    configureIosAudioSession();
    if (!this.ctx || this.muted) return;
    const st = this.ctx.state as string;
    if (st !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    this.lastObservedAudioTime = this.ctx.currentTime;
    this.lastObservedWallMs = performance.now();
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
    const wasMuted = this.muted;
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // ignore storage errors
    }

    if (!muted) {
      this.needsRouteKick = true;
      this.unlock();
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.44, now, 0.04);
      if (!muted) {
        if ((this.ctx.state as string) !== 'running') {
          this.ctx.resume().catch(() => {});
        }
        this.kickCoreAudioRoute();
        if (wasMuted) {
          // Gentle confirmation chime so user immediately hears sound is alive after unmuting!
          const { rootMidi } = this.computeSolarParams(this.timeOfDayHours);
          this.playTone(midiToHz(rootMidi + 7), 0.24, 0.09, 'sine', 0.02, 0.006);
          this.playTone(midiToHz(rootMidi + 12), 0.32, 0.08, 'sine', 0.08, 0.006);
        }
      }
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVisibilityHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) {
      this.needsRouteKick = true;
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else {
      this.handleForegroundResume();
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
    if ((this.ctx.state as string) !== 'running' && !this.muted) {
      this.ctx.resume().catch(() => {});
    }
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

  /** Consumes WASM simulation event counters and plays Balatro/VS escalating foley & Android haptics. */
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
      vibratePattern(info.hapticsEnabled, [18, 28, 36]);
      if (this.ctx && !this.muted) {
        [0, 7, 12, 16, 19].forEach((semi, idx) => {
          this.playTone(midiToHz(rootMidi + semi), 1.1, 0.11, 'triangle', idx * 0.055, 0.008);
        });
      }
    }

    if (events.colorClearEvents > prev.colorClearEvents) {
      vibratePattern(info.hapticsEnabled, [14, 22, 24]);
      if (this.ctx && !this.muted) {
        [4, 7, 11, 16].forEach((semi, idx) => {
          this.playTone(midiToHz(rootMidi + semi), 0.78, 0.115, 'sine', idx * 0.045, 0.006);
        });
      }
    }

    if (events.stitchEvents > prev.stitchEvents) {
      const streakStep = Math.min(Math.max(0, info.streak - 1), SOLAR_SCALE_SEMITONES.length - 1);
      const semi = SOLAR_SCALE_SEMITONES[streakStep];
      vibratePattern(info.hapticsEnabled, Math.min(22, 9 + streakStep));
      if (this.ctx && !this.muted) {
        const baseHz = midiToHz(rootMidi + semi);
        this.playTone(baseHz, 0.72, 0.145, 'sine', 0, 0.006);
        this.playTone(
          baseHz * 2.0,
          0.36,
          lerp(0.032, 0.075, clamp01(daylight * 0.6 + streakStep * 0.06)),
          'triangle',
          0.005,
          0.005,
        );
        if (info.streak >= 5) {
          this.playTone(baseHz * 1.5, 0.45, 0.055, 'sine', 0.025, 0.006);
        }
      }
    }

    if (events.trayEvents > prev.trayEvents) {
      vibratePattern(info.hapticsEnabled, info.trayTension >= 0.75 ? [14, 24, 18] : 10);
      if (this.ctx && !this.muted) {
        const tensionPitch = info.trayTension >= 0.75 ? -5 : -2;
        this.playTone(midiToHz(rootMidi + tensionPitch), 0.24, 0.09, 'triangle', 0, 0.006);
      }
    }

    if (events.blockedEvents > prev.blockedEvents) {
      vibratePattern(info.hapticsEnabled, [16, 26, 16]);
      if (this.ctx && !this.muted) {
        this.playTone(170, 0.13, 0.09, 'triangle', 0, 0.004);
        this.playTone(128, 0.14, 0.07, 'sine', 0.035, 0.004);
      }
    }

    if (events.undoEvents > prev.undoEvents) {
      vibratePattern(info.hapticsEnabled, 10);
      if (this.ctx && !this.muted) {
        this.playTone(midiToHz(rootMidi + 7), 0.18, 0.075, 'sine', 0, 0.008);
        this.playTone(midiToHz(rootMidi + 2), 0.24, 0.07, 'sine', 0.065, 0.008);
      }
    }
  }
}
