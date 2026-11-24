import './style.css';
import { setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import { WasmSimulation, type SimSnapshot } from './wasmBridge';

export interface GameTestState extends SimSnapshot {
  ready: boolean;
  renderer: RendererDiagnostics;
}

export interface GameTestBridge {
  ready(): Promise<void>;
  getState(): GameTestState;
  stepTicks(ticks: number): Promise<void>;
  setPointerNormalized(nx: number, nz: number, active: boolean): void;
  reset(): void;
}

declare global {
  interface Window {
    __GAME_TEST__?: GameTestBridge;
  }
}

const FIXED_DT = 1 / 60;

async function bootstrap(): Promise<void> {
  setupSafariPwaShell();

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const scoreEl = document.getElementById('hud-score');
  const resetBtn = document.getElementById('btn-reset');
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
    const sim = await WasmSimulation.load('/game.wasm');
    const renderer = await WebGPURaytracer.create(canvas, sim.sceneByteLength);

    let lastScore = -1;
    let isReady = false;
    let pointerDown = false;

    const updateHud = (snapshot: SimSnapshot): void => {
      if (scoreEl && snapshot.score !== lastScore) {
        scoreEl.textContent = String(snapshot.score);
        lastScore = snapshot.score;
      }
    };

    const renderNow = (): SimSnapshot => {
      const snap = sim.readState();
      renderer.render(sim.sceneView(), snap.elapsedSec);
      updateHud(snap);
      return snap;
    };

    const mapClientToNormalized = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const nz = ((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      return [Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, nz))];
    };

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointerDown = true;
      canvas.setPointerCapture?.(e.pointerId);
      const [nx, nz] = mapClientToNormalized(e.clientX, e.clientY);
      sim.setPointerNormalized(nx, nz, true);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointerDown) return;
      e.preventDefault();
      const [nx, nz] = mapClientToNormalized(e.clientX, e.clientY);
      sim.setPointerNormalized(nx, nz, true);
    });

    const releasePointer = () => {
      if (!pointerDown) return;
      pointerDown = false;
      sim.setPointerNormalized(0, 0, false);
    };
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);

    resetBtn?.addEventListener('click', () => {
      sim.reset();
      renderNow();
    });

    window.addEventListener('resize', () => {
      renderer.resize();
      renderNow();
    });

    // Expose deterministic AI playtest & E2E verification bridge (Spec 02)
    window.__GAME_TEST__ = {
      ready: () => readyPromise,
      getState: () => ({
        ready: isReady,
        ...sim.readState(),
        renderer: renderer.getDiagnostics(),
      }),
      stepTicks: async (ticks: number) => {
        const count = Math.max(1, Math.min(600, Math.floor(ticks)));
        for (let i = 0; i < count; i++) {
          sim.step(FIXED_DT);
        }
        renderNow();
        await renderer.flush();
      },
      setPointerNormalized: (nx: number, nz: number, active: boolean) => {
        sim.setPointerNormalized(nx, nz, active);
      },
      reset: () => {
        sim.reset();
        renderNow();
      },
    };

    // Render initial frame and flush GPU before signaling ready
    sim.step(FIXED_DT);
    renderNow();
    await renderer.flush();
    isReady = true;
    resolveReady();

    // Main animation loop (fixed-step accumulator for consistent iPhone 60/120Hz physics)
    let lastTs = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      accumulator += dt;
      while (accumulator >= FIXED_DT) {
        sim.step(FIXED_DT);
        accumulator -= FIXED_DT;
      }
      renderNow();
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
