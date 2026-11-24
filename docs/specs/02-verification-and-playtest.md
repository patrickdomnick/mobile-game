# Spec 02 — Autonomous AI E2E Verification & Playtest Contract

- **Status**: `Locked` (extensible)
- **Last Updated**: 2026-11-24

---

## 1. Goal

Any AI agent or CI runner without an iPhone must be able to:
1. Build the Go/TinyGo WASM module and web bundle from scratch.
2. Launch the production app in a headless browser emulating an **iPhone 16** (`393×852`, `deviceScaleFactor: 3`, `hasTouch: true`, `isMobile: true`).
3. Verify real-time **WebGPU raytracing** executes cleanly with zero GPU validation errors and renders valid, non-black pixels.
4. **Autonomously play the game** using real pointer/touch inputs guided by structured telemetry, proving game loops (movement, scoring, collision, reset) work end-to-end.
5. Capture visual screenshots for inspection.

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

> Note: Linux Playwright WebKit does not expose WebGPU (`navigator.gpu === undefined`), while real iOS 26 Safari on iPhone 16 ships WebGPU enabled by default. Chromium + SwiftShader validates WGSL shader compilation, bind groups, buffer layouts, and pixel output deterministically on Linux.

---

## 3. Required Test Bridge (`window.__GAME_TEST__`)

The web shell MUST expose `window.__GAME_TEST__` with at least the following stable interface:

```ts
interface GameTestBridge {
  /** Resolves once WASM is loaded and WebGPU pipeline has rendered at least 1 frame */
  ready(): Promise<void>;

  /** Current simulation & renderer snapshot */
  getState(): {
    ready: boolean;
    frameCount: number;
    elapsedSec: number;
    score: number;
    player: { x: number; y: number; z: number; vx: number; vz: number };
    target: { x: number; y: number; z: number };
    renderer: {
      backend: 'webgpu';
      width: number;
      height: number;
      validationErrors: string[];
    };
  };

  /** Advance simulation deterministically by N fixed ticks and render one frame */
  stepTicks(ticks: number): Promise<void>;

  /** Set normalized touch target in [-1, 1] arena coordinates (mirrors pointer/touch input) */
  setPointerNormalized(nx: number, ny: number, active: boolean): void;

  /** Reset simulation state */
  reset(): void;
}
```

---

## 4. Mandatory E2E Assertions (`pnpm test:e2e`)

1. **PWA & iPhone 16 Shell Checks**:
   - `manifest.webmanifest` loads with HTTP 200 and `display === "standalone"`.
   - `<meta name="apple-mobile-web-app-capable" content="yes">` and `viewport-fit=cover` are present.
   - Service worker file `/sw.js` is reachable (HTTP 200).
   - No horizontal or vertical page overflow (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`).
2. **WASM & WebGPU Health**:
   - Zero `console.error`, zero `pageerror`, zero `renderer.validationErrors`.
   - Canvas is full-viewport and rendered frame contains meaningful color variance (not all-black or single solid color).
3. **Autonomous Playtest Loop**:
   - Capture `test-results/initial-frame.png`.
   - Autonomous agent reads `player` and `target` coordinates from `window.__GAME_TEST__.getState()`, applies synthetic touch input to steer the player toward the target, and steps frames until collision.
   - Asserts player position changed, `score >= 1`, and target relocated.
   - Capture `test-results/after-playtest.png`.
   - Clicks Reset UI and asserts `score === 0`.
