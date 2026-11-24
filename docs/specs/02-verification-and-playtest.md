# Spec 02 — Autonomous AI E2E Verification & Playtest Contract

- **Status**: `Locked` (extensible)
- **Last Updated**: 2026-11-24

---

## 1. Goal

Any AI agent or CI runner without an iPhone must be able to:
1. Build the Go/TinyGo WASM module and web bundle from scratch.
2. Launch the production app in a headless browser emulating an **iPhone 16** (`393×852`, `deviceScaleFactor: 3`, `hasTouch: true`, `isMobile: true`).
3. Verify real-time **WebGPU raytracing** executes cleanly with zero GPU validation errors and renders valid, non-black pixels across the full 24-hour solar cycle (Dawn, Noon, Golden Hour, Midnight).
4. **Autonomously play and solve Pearl Loom puzzles** using real canvas tap coordinates guided by structured telemetry, proving untangling, silk tray holding, auto-stitch cascading, Undo, Hint, Blocked wobble, Tray-Full recovery, Gallery persistence, and Procedural Mandalas end-to-end.
5. Measure performance metrics (WASM size, JS bundle size, frame times, idle battery throttling).
6. Capture visual screenshots for inspection.

---

## 2. Browser Execution Profile (Headless Linux VM)

Playwright runs **Chromium** (`channel: "chromium"`) against `http://localhost:<port>` (secure context required for `navigator.gpu`) with:

```ts
args: [
  '--enable-unsafe-webgpu',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--ignore-gpu-blocklist',
]
```

---

## 3. Required Test Bridge (`window.__GAME_TEST__`)

```ts
interface GameTestBridge {
  /** Resolves once WASM is loaded and WebGPU pipeline has rendered at least 1 frame */
  ready(): Promise<void>;

  /** Current Pearl Loom simulation, puzzle, audio & renderer snapshot */
  getState(): {
    ready: boolean;
    frameCount: number;
    elapsedSec: number;
    levelIndex: number;
    levelName: string;
    mode: 'curated' | 'mandala' | 'daily';
    phase: 'playing' | 'tray_full' | 'complete';
    timeOfDayHours: number;
    isAnimating: boolean;
    moves: number;
    undoDepth: number;
    stitchedCount: number;
    totalPearls: number;
    activeColors: number[];
    trayColors: number[];
    trayCapacity: number;
    hintTileIndex: number;
    gridCols: number;
    gridRows: number;
    tiles: Array<{
      index: number;
      col: number;
      row: number;
      color: number;
      dir: number; // 0=Up, 1=Right, 2=Down, 3=Left
      alive: boolean;
      unblocked: boolean;
      screenX: number; // Normalized [0, 1] viewport X for real tap testing
      screenY: number; // Normalized [0, 1] viewport Y for real tap testing
    }>;
    audio: {
      initialized: boolean;
      muted: boolean;
      notesScheduled: number;
    };
    renderer: {
      backend: 'webgpu';
      width: number;
      height: number;
      dpr: number;
      isIdleThrottled: boolean;
      renderedFrames: number;
      lastFrameMs: number;
      validationErrors: string[];
    };
  };

  /** Advance simulation deterministically by N fixed ticks and render one frame */
  stepTicks(ticks: number): Promise<void>;

  /** Tap a board tile directly (or use real Playwright page.touchscreen.tap / click on tile.screenX/Y) */
  tapTile(tileIndex: number): boolean;

  /** Trigger Undo / Hint / Reset / Level selection / Solar time override */
  undo(): boolean;
  hint(): number;
  reset(): void;
  loadLevel(levelIndex: number): void;
  loadMandala(seed: number): void;
  loadDaily(): void;
  setTimeOfDayOverride(hours: number | null): void;
}
```

---

## 4. Mandatory E2E Assertions (`pnpm test:e2e`)

1. **PWA, Layout & Contrast Clarity Checks**:
   - `manifest.webmanifest`, `sw.js`, `apple-touch-icon.png`, `game.wasm` all return HTTP 200; zero HTTP >= 400 responses.
   - Safari standalone meta tags (`apple-mobile-web-app-capable="yes"`, `viewport-fit=cover`) and zero overflow (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`).
   - All visible HUD buttons are within safe viewport bounds, have non-empty accessible labels, and meet minimum touch target size (`>= 36px`).
2. **WASM & WebGPU Raytracing Health**:
   - Zero `console.error`, zero `pageerror`, zero `renderer.validationErrors`.
   - Captures visual screenshots across solar phases (Dawn, Noon, Golden Hour, Night) and asserts frames are non-blank and visibly distinct.
3. **Autonomous Full Playthrough**:
   - Tests blocked-tile tap (gentle wobble, tile remains alive).
   - Tests Hint glow returns a valid safe unblocked tile.
   - Tests Undo cleanly restores previous tile/tray/stitch state.
   - Autonomously solves a full embroidery artwork using real pointer taps on tile screen coordinates until `phase === 'complete'` and `stitchedCount === totalPearls`.
   - Verifies Gallery persistence across `page.reload()` and Procedural Mandala + Daily Stitch loading.
   - Verifies idle frame throttling engages once animations settle (battery optimization check).
