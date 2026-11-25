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

## 3. Always-Ready Hot-Reload Local Playable Server & Verification Gate

### 3.1 Always-Ready Playable Local Dev Server (Port `5173`)
- **Rule**: Keep a live, playable, hot-reloading version running on **`http://localhost:5173`** (`pnpm dev`) throughout active development so the title can be playtested at any moment while work is progressing.
- **Full-Stack Hot Reload (`vite.config.ts`)**: `pnpm dev` runs on strict port **`5173`** (`host: true`) with a custom Vite watcher (`watchSimWasmPlugin`) that automatically recompiles `sim/**/*.go` → `public/game.wasm` and triggers a live browser reload alongside Vite HMR for TypeScript, CSS, and WGSL shaders.
- **Zero Port Collision**: Live interactive playtesting uses port **`5173`** (`pnpm dev`), while automated Playwright E2E verification uses isolated port **`4173`** (`pnpm preview`), so the playable dev server never has to be stopped during `pnpm verify`.

### 3.2 Mandatory Verification Gate (Definition of Done)

Never claim a change works without running the full verification command:

```bash
pnpm verify
```

`pnpm verify` MUST pass all of the following in fail-fast order:
1. **Fail-Fast Contract & Pitfall Guard (`< 100ms`)**: `pnpm check:contracts` (`scripts/check-contracts.mjs`)
   - Enforces exact float-count ABI parity across `sim/engine.go`, `src/main.ts` (`SCENE_BUFFER_BYTES`), and `src/renderer/raytrace.wgsl` (`SceneData`).
   - Blocks WGSL reserved keywords (`meta`, `ref`, `self`, `type`, etc.), double-gamma shader regressions (requires `toLinear`), accidental GPU tile visual spoilers (`flags |= 2`), and non-relative PWA paths.
2. **Go simulation unit tests**: `cd sim && go test ./...`
3. **TinyGo WASM build**: `pnpm build:wasm` (compiles `public/game.wasm` and checks binary size budget)
4. **TypeScript typecheck & Vite production build**: `pnpm typecheck && pnpm build`
5. **Autonomous Headless Browser E2E & WebGPU Playtest**: `pnpm test:e2e`
   - Runs against the built production app on `http://localhost:4173` in headless Chromium with SwiftShader WebGPU enabled and iPhone 16 viewport/touch emulation.
   - Asserts zero console/page/HTTP/WebGPU validation errors, automated canvas **luminance contrast & chromatic saturation pixel audits** (catching washed-out double-gamma or monochrome color bleed automatically), PWA manifest & Safari meta tags, zero-spoiler causal blocker feedback, and full autonomous gameplay completion.
   - Captures verification screenshots under `test-results/` — **always inspect captured screenshots visually** before declaring a visual change done.

### 3.3 Learned Pitfalls & Early-Catch Engineering Rules
Record and enforce hard-won lessons so they never regress:
- **Linear-Space PBR Color (No Double-Gamma Washout)**: Always convert sRGB palette/theme colors to linear space (`x * x` via `toLinear`) before raytracing lighting and encode once on output (`sqrt`). Avoid per-pixel `pow(c, 2.2)` inside entity loops to protect iPhone 16 GPU battery and SwiftShader speed.
- **No WGSL Reserved Identifiers**: Never name WGSL struct fields or variables `meta`, `ref`, `self`, `type`, `using`, etc. (`pnpm check:contracts` catches this before building).
- **Decouple DOM Animations from GPU Wakes**: Pure HUD animations (like rolling score tickers) must update DOM text without waking the WebGPU render loop; serialize `stepTicks` and `rAF` with `frameInFlight` so GPU queues never stack.
- **No Visual Spoilers on Puzzle Tiles**: Never encode solvability/unblocked hints into resting tile GPU flags; show causal feedback only on tap (recoil + blocker impact beam) or explicit Hint.
- **Always Bump Service Worker Cache on Releases**: Increment `CACHE_NAME` in `public/sw.js` (`pearl-loom-vN`) before pushing a milestone release to `origin/main` so installed iPhone 16 standalone PWAs flush stale WASM/bundles immediately.

---

## 4. Autonomous AI Playtest Contract

Keep `window.__GAME_TEST__` intact and backward-compatible (see `docs/specs/02-verification-and-playtest.md`):
- Exposes read-only simulation state snapshot (frame count, elapsed time, mode/phase, score, entity positions, renderer diagnostics).
- Exposes deterministic stepping and synthetic touch/pointer helpers so an AI agent or Playwright test can autonomously play the game without timing flakiness.

---

## 5. Git, Commit, Push & HTTPS Release Rules (Solo Project)

- **Commit Every Completed Step to `main`**:
  - This is a solo project. Every time a discrete step, slice, or fix is completed and verified via `pnpm verify`, **commit it directly to `main`** with a small, focused commit message referencing the spec or slice.
  - Do not leave completed steps uncommitted, and do not create feature branches/PRs unless explicitly requested by the user.
- **Fast Local Iteration vs. Push for Real E2E Releases**:
  - **Active Agentic Iteration (fast loop)**: Iterate locally (`pnpm dev` / `pnpm verify`) and commit completed milestones to local `main`. Do **not** push to `origin/main` on every rapid tweak.
  - **Milestone Releases / Real iPhone E2E Checks**: Push `main` (`git push origin main`) when ready for a release or to test live on a real iPhone 16 over HTTPS.
- **Automated HTTPS Deployment (GitHub Pages)**:
  - Pushing to `main` (or triggering `workflow_dispatch`) runs `.github/workflows/deploy-pages.yml`, which runs Go tests, compiles TinyGo WASM, builds the Vite bundle, and publishes the installable HTTPS PWA to **`https://patrickdomnick.github.io/mobile-game/`**.
  - **Subpath Portability Invariant**: Keep `vite.config.ts` at `base: './'` and all runtime asset/PWA URLs relative (`./game.wasm`, `./manifest.webmanifest`, `./sw.js`, `./apple-touch-icon.png`) so the exact same build works both locally (`http://localhost:4173/`) and on GitHub Pages (`/mobile-game/`).
- **Hygiene**:
  - Do not commit `node_modules/`, `dist/`, `test-results/`, or generated `public/game.wasm` (WASM is built deterministically by `pnpm build:wasm`).
  - Preserve existing comments, ADRs, and spec history; record why an experiment was kept or discarded.
