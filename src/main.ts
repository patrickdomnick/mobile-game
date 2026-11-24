import './style.css';
import { ProceduralSoundscape } from './audio/soundscape';
import { unprojectScreenToPlane } from './camera';
import { setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import { CURATED_LEVEL_NAMES, PEARL_COLORS, WasmSimulation, type SimSnapshot } from './wasmBridge';

export interface GameTestState extends SimSnapshot {
  ready: boolean;
  audio: {
    initialized: boolean;
    muted: boolean;
    notesScheduled: number;
  };
  renderer: RendererDiagnostics;
}

export interface GameTestBridge {
  ready(): Promise<void>;
  getState(): GameTestState;
  stepTicks(ticks: number): Promise<void>;
  tapTile(tileIndex: number): boolean;
  undo(): boolean;
  hint(): number;
  reset(): void;
  loadLevel(levelIndex: number): void;
  setTimeOfDayOverride(hours: number | null): void;
}

declare global {
  interface Window {
    __GAME_TEST__?: GameTestBridge;
  }
}

const FIXED_DT = 1 / 60;
const IDLE_FRAME_INTERVAL_MS = 160; // ~6 FPS when calm & still for iPhone 16 battery savings

function getRealTimeOfDayHours(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

async function bootstrap(): Promise<void> {
  setupSafariPwaShell();

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const appEl = document.getElementById('app');
  const patternBtn = document.getElementById('btn-pattern');
  const patternNameEl = document.getElementById('hud-pattern-name');
  const progressEl = document.getElementById('hud-progress');
  const swatchCaptionEl = document.getElementById('swatch-caption');
  const swatchListEl = document.getElementById('swatch-list');
  const audioBtn = document.getElementById('btn-audio') as HTMLButtonElement | null;
  const audioIconEl = document.getElementById('audio-icon');
  const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
  const hintBtn = document.getElementById('btn-hint') as HTMLButtonElement | null;
  const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement | null;

  const trayFullModal = document.getElementById('overlay-tray-full');
  const trayUndoBtn = document.getElementById('btn-tray-undo');
  const trayRestartBtn = document.getElementById('btn-tray-restart');

  const completeModal = document.getElementById('overlay-complete');
  const completeTitleEl = document.getElementById('complete-title');
  const completeStatsEl = document.getElementById('complete-stats');
  const nextLevelBtn = document.getElementById('btn-next-level');
  const replayLevelBtn = document.getElementById('btn-replay-level');

  const fallbackBanner = document.getElementById('fallback-banner');
  const fallbackMessage = document.getElementById('fallback-message');

  if (!canvas) {
    throw new Error('Missing #gpu-canvas element');
  }

  let resolveReady!: () => void;
  let rejectReady!: (err: unknown) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  try {
    const sim = await WasmSimulation.load('./game.wasm');
    const renderer = await WebGPURaytracer.create(canvas, sim.sceneByteLength);
    const soundscape = new ProceduralSoundscape();

    let isReady = false;
    let timeOverride: number | null = null;
    let lastSwatchKey = '';
    let lastLightingTheme = '';
    let lastRenderAt = 0;
    let needsImmediateRender = true;
    let frameInFlight = false;

    const updateAudioUi = (): void => {
      const muted = soundscape.isMuted();
      if (audioBtn) {
        audioBtn.classList.toggle('is-muted', muted);
        audioBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        audioBtn.setAttribute('aria-label', muted ? 'Unmute Sound' : 'Mute Sound');
      }
      if (audioIconEl) {
        audioIconEl.textContent = muted ? '✕' : '♪';
      }
    };
    updateAudioUi();

    const getAspect = (): number => {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0.2, rect.width / Math.max(1, rect.height));
    };

    const syncClock = (): void => {
      const hours = timeOverride !== null ? timeOverride : getRealTimeOfDayHours();
      sim.setTimeOfDayHours(hours);
      soundscape.applySolarAtmosphere(hours);
    };

    const updateHud = (snap: SimSnapshot): void => {
      soundscape.syncEvents(snap.events);

      // Smoothly adapt HUD ink contrast to solar brightness (no harsh jump!)
      const nextTheme = snap.sunIntensity < 0.62 ? 'night' : 'day';
      if (appEl && nextTheme !== lastLightingTheme) {
        appEl.dataset.lighting = nextTheme;
        lastLightingTheme = nextTheme;
      }

      if (patternNameEl) patternNameEl.textContent = snap.levelName;
      if (progressEl) progressEl.textContent = `${snap.stitchedCount} / ${snap.totalPearls}`;
      if (undoBtn) undoBtn.disabled = snap.undoDepth === 0;

      const isDone = snap.activeColors.length === 0 && snap.phase === 'complete';
      const swatchKey = isDone
        ? 'DONE'
        : snap.activeColors.map((c, i) => `${c}:${snap.activeRemain[i]}`).join('|');

      if (swatchListEl && swatchKey !== lastSwatchKey) {
        lastSwatchKey = swatchKey;
        swatchListEl.innerHTML = '';
        if (swatchCaptionEl) {
          swatchCaptionEl.textContent = isDone ? '✦ DONE' : 'STITCH';
        }
        if (!isDone) {
          for (let i = 0; i < snap.activeColors.length; i++) {
            const colorIdx = snap.activeColors[i];
            const remain = snap.activeRemain[i];
            const info = PEARL_COLORS[colorIdx] ?? PEARL_COLORS[0];
            const item = document.createElement('span');
            item.className = 'swatch-item';
            item.title = `${info.name} (${remain} left)`;

            const dot = document.createElement('span');
            dot.className = 'swatch-dot';
            dot.style.backgroundColor = info.hex;

            const count = document.createElement('span');
            count.className = 'swatch-count';
            count.textContent = String(remain);

            item.append(dot, count);
            swatchListEl.append(item);
          }
        }
      }

      if (trayFullModal) {
        trayFullModal.classList.toggle('hidden', snap.phase !== 'tray_full');
      }
      if (completeModal) {
        const showComplete = snap.phase === 'complete' && !snap.isAnimating;
        completeModal.classList.toggle('hidden', !showComplete);
        if (showComplete) {
          if (completeTitleEl) completeTitleEl.textContent = snap.levelName;
          if (completeStatsEl) {
            completeStatsEl.textContent = `Stitched calmly in ${snap.moves} moves.`;
          }
        }
      }
    };

    const renderNow = (): SimSnapshot => {
      const snap = sim.readState(getAspect());
      renderer.render(sim.sceneView(), snap.elapsedSec);
      updateHud(snap);
      return snap;
    };

    const renderNonBlocking = (): void => {
      if (frameInFlight) return;
      frameInFlight = true;
      renderNow();
      renderer.flush().finally(() => {
        frameInFlight = false;
      });
    };

    const wakeRenderer = (): void => {
      needsImmediateRender = true;
      renderer.setIdleThrottled(false);
    };

    // Real touch / pointer interaction mapped analytically onto the untangle board
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      soundscape.unlock();
      const rect = canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / Math.max(1, rect.width);
      const v = (e.clientY - rect.top) / Math.max(1, rect.height);
      const hit = unprojectScreenToPlane(u, v, getAspect(), 0.14);
      if (hit) {
        sim.tapWorld(hit.wx, hit.wz);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      }
    });

    const handleUndo = () => {
      soundscape.unlock();
      sim.undo();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleReset = () => {
      soundscape.unlock();
      sim.reset();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleHint = () => {
      soundscape.unlock();
      sim.hint();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleNextLevel = () => {
      soundscape.unlock();
      const snap = sim.readState(getAspect());
      sim.loadLevel((snap.levelIndex + 1) % CURATED_LEVEL_NAMES.length);
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    audioBtn?.addEventListener('click', () => {
      soundscape.toggleMute();
      updateAudioUi();
    });
    undoBtn?.addEventListener('click', handleUndo);
    trayUndoBtn?.addEventListener('click', handleUndo);
    resetBtn?.addEventListener('click', handleReset);
    trayRestartBtn?.addEventListener('click', handleReset);
    replayLevelBtn?.addEventListener('click', handleReset);
    hintBtn?.addEventListener('click', handleHint);
    nextLevelBtn?.addEventListener('click', handleNextLevel);
    patternBtn?.addEventListener('click', handleNextLevel);

    document.addEventListener('visibilitychange', () => {
      soundscape.setVisibilityHidden(document.visibilityState === 'hidden');
    });

    window.addEventListener('resize', () => {
      renderer.resize();
      wakeRenderer();
      renderNonBlocking();
    });

    // Expose deterministic AI playtest & E2E verification bridge (Spec 02)
    window.__GAME_TEST__ = {
      ready: () => readyPromise,
      getState: () => ({
        ready: isReady,
        ...sim.readState(getAspect()),
        audio: soundscape.getDiagnostics(),
        renderer: renderer.getDiagnostics(),
      }),
      stepTicks: async (ticks: number) => {
        const count = Math.max(1, Math.min(600, Math.floor(ticks)));
        syncClock();
        for (let i = 0; i < count; i++) {
          sim.step(FIXED_DT);
        }
        renderNow();
        await renderer.flush();
      },
      tapTile: (tileIndex: number) => {
        const ok = sim.tapTile(tileIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      undo: () => {
        const ok = sim.undo();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      hint: () => {
        const idx = sim.hint();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return idx;
      },
      reset: () => {
        sim.reset();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadLevel: (levelIndex: number) => {
        sim.loadLevel(levelIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      setTimeOfDayOverride: (hours: number | null) => {
        timeOverride = hours;
        syncClock();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
    };

    // Initial solar sync + first raytraced frame
    syncClock();
    sim.step(FIXED_DT);
    renderNow();
    await renderer.flush();
    isReady = true;
    resolveReady();

    // Idle-smart adaptive frame loop (60 FPS during active motion, ~6 FPS when calm, 0 FPS when backgrounded)
    let lastTs = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      if (document.visibilityState === 'hidden') {
        lastTs = now;
        requestAnimationFrame(frame);
        return;
      }

      syncClock();
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const preSnap = sim.readState(getAspect());
      const activeMotion = preSnap.isAnimating || needsImmediateRender;

      if (activeMotion) {
        renderer.setIdleThrottled(false);
        accumulator += dt;
        while (accumulator >= FIXED_DT) {
          sim.step(FIXED_DT);
          accumulator -= FIXED_DT;
        }
        if (!frameInFlight) {
          renderNonBlocking();
          lastRenderAt = now;
          needsImmediateRender = false;
        }
      } else {
        renderer.setIdleThrottled(true);
        if (!frameInFlight && now - lastRenderAt >= IDLE_FRAME_INTERVAL_MS) {
          sim.step(Math.min(0.05, (now - lastRenderAt) / 1000));
          renderNonBlocking();
          lastRenderAt = now;
        }
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (err) {
    console.error('[boot] failed:', err);
    if (fallbackBanner) fallbackBanner.classList.remove('hidden');
    if (fallbackMessage) {
      fallbackMessage.textContent =
        err instanceof Error ? err.message : 'Unable to initialize WebGPU raytracer.';
    }
    rejectReady(err);
  }
}

void bootstrap();
