# AGENTS.md — Agentic Workflow & Project Rules

This repository builds a single-screen, hardware-accelerated raytraced mobile game targeting **iPhone 16 (Safari 26+ standalone PWA)**, powered by **TinyGo WebAssembly** and **WebGPU (WGSL)**.

Every agent operating in this repo MUST follow these rules.

---

## 1. Non-Negotiable Architecture & Platform Constraints

- **Target Device & Browser**: iPhone 16 (`393×852` CSS px, `3x` DPR, portrait single-screen, Dynamic Island top safe area, Home Indicator bottom safe area) running **iOS Safari 26+** as an **installable standalone PWA** (`Add to Home Screen`).
- **No Scrolling / No Browser Chrome Bleed**: Single-screen full-bleed viewport (`100dvh`, `viewport-fit=cover`, `touch-action: none`, `overscroll-behavior: none`, `user-select: none`). All interactive HUD elements must respect `env(safe-area-inset-*)`.
- **Compute / Render Split**:
  - **`sim/` (TinyGo → WebAssembly)**: Owns deterministic game simulation, physics, input state, scoring, and scene data packed into a flat `float32` linear-memory buffer. Must compile with `tinygo` (`-target=wasip1 -buildmode=c-shared`) and stay zero-allocation in the per-frame `Step` hot path.
  - **`src/renderer/` (WebGPU + WGSL)**: Owns real-time hardware-accelerated raytracing / raymarching on the GPU, consuming the flat scene buffer uploaded from WASM memory each frame.
  - **`src/` (TypeScript + Vite + `pnpm`)**: Thin shell for WASM loading, WebGPU device lifecycle, touch/pointer input, PWA registration, and the E2E test bridge. Never duplicate game rules in TypeScript.
- **Package Manager**: Always use `pnpm` (never `npm` or `yarn`).

---

## 2. Spec-Driven Iterative Workflow

We develop **spec-first, iteratively**:

1. **Read specs before coding**:
   - Locked constraints: `docs/specs/00-platform-and-tech.md`
   - Living game vision: `docs/specs/01-game-vision.md`
   - Verification contract: `docs/specs/02-verification-and-playtest.md`
   - Architectural decisions: `docs/adr/`
2. **Update specs before (or alongside) code**:
   - Every new feature, mechanic experiment, or prototype starts with a concise spec update in `docs/specs/01-game-vision.md` (or a spike note under `docs/specs/spikes/`).
   - Mark experimental sections `Status: Prototyping` until validated by an actual playable build + E2E playtest, then promote to `Status: Locked` or prune if cut.
   - Major technical tradeoffs get a 1-page ADR in `docs/adr/`.
3. **Keep slices vertical and testable**:
   - Prefer small, end-to-end playable increments over large speculative rewrites.
   - Use project skills in `.agents/skills/` (`spec-iterate`, `verify-playtest`) when iterating on mechanics or verifying builds.

---

## 3. Mandatory Verification Gate (Definition of Done)

Never claim a change works without running the full verification command:

```bash
pnpm verify
```

`pnpm verify` MUST pass all of the following:
1. **Go simulation unit tests**: `cd sim && go test ./...`
2. **TinyGo WASM build**: `pnpm build:wasm` (compiles `public/game.wasm` and checks binary size budget)
3. **TypeScript typecheck & Vite production build**: `pnpm typecheck && pnpm build`
4. **Autonomous Headless Browser E2E & WebGPU Playtest**: `pnpm test:e2e`
   - Runs against the built production app on `http://localhost` in headless Chromium with SwiftShader WebGPU enabled and iPhone 16 viewport/touch emulation.
   - Asserts zero console errors, zero uncaught page errors, zero WebGPU validation/uncaptured errors, non-black raytraced canvas output, PWA manifest & Safari meta tags, and autonomous play interaction that mutates simulation state.
   - Captures verification screenshots under `test-results/` for visual inspection.

---

## 4. Autonomous AI Playtest Contract

Keep `window.__GAME_TEST__` intact and backward-compatible (see `docs/specs/02-verification-and-playtest.md`):
- Exposes read-only simulation state snapshot (frame count, elapsed time, mode/phase, score, entity positions, renderer diagnostics).
- Exposes deterministic stepping and synthetic touch/pointer helpers so an AI agent or Playwright test can autonomously play the game without timing flakiness.

---

## 5. Git & Hygiene Rules

- Do not commit `node_modules/`, `dist/`, `test-results/`, or generated `public/game.wasm` (WASM is built deterministically by `pnpm build:wasm`).
- Keep commits small, focused, and linked to the spec section they implement.
- Preserve existing comments, ADRs, and spec history; record why an experiment was kept or discarded.
