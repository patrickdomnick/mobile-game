---
name: spec-iterate
description: Guides spec-driven iterative development for this mobile raytraced game — updating living specs before coding, maintaining an always-ready hot-reloading dev server on port 5173, running fail-fast contract guards and autonomous playtests, and recording findings.
---
# Spec-Driven Iteration Workflow

Use this workflow whenever proposing, prototyping, or refining game mechanics, visuals, or technical architecture.

## Steps

1. **Ensure the always-ready playable dev server is live (port `5173`)**:
   - Keep `pnpm dev` running on **`http://localhost:5173`** throughout active iteration (`vite.config.ts` auto-rebuilds `sim/**/*.go` → `public/game.wasm` and hot-reloads TypeScript, CSS, and WGSL shaders).
   - E2E verification uses isolated port **`4173`**, so keep `5173` alive continuously while working.

2. **Read current truth**:
   - Read `AGENTS.md`, `docs/specs/00-platform-and-tech.md`, `docs/specs/01-game-vision.md`, `docs/specs/02-verification-and-playtest.md`, and `docs/specs/03-design-philosophy-and-polish.md`.
   - Confirm no locked constraint or Pitfalls Ledger rule in `AGENTS.md` is violated.

3. **Write or update the spec delta FIRST**:
   - Add or update a section in `docs/specs/01-game-vision.md` with `Status: Prototyping` and explicit **Acceptance Checks** (simulation invariants, zero-spoiler rules, visual contrast/pop expectations, and playfeel goals).
   - If making a structural technical choice, write a short ADR in `docs/adr/NNNN-<slug>.md`.

4. **Implement a minimal vertical slice & fail-fast check**:
   - Put simulation logic in `sim/` (pure Go, deterministic, zero-GC hot loop) with unit tests in `sim/*_test.go`.
   - Keep `sim/engine.go`, `src/main.ts` (`SCENE_BUFFER_BYTES`), and `src/renderer/raytrace.wgsl` (`SceneData`) strictly in sync; run `pnpm check:contracts` immediately (< 100ms) after editing any buffer layout or shader.
   - Keep `raytrace.wgsl` in physical linear color space (`toLinear` / `sqrt`) with no reserved WGSL keywords (`meta`, `ref`, `self`, `type`, etc.).
   - Update `window.__GAME_TEST__` only by extending (never breaking) the contract.

5. **Verify end-to-end autonomously**:
   - Run `pnpm verify` (`check:contracts` → `test:go` → `build:wasm` → `typecheck` → `vite build` → `test:e2e` with automated pixel contrast/saturation audits).
   - Visually inspect generated screenshots in `test-results/` via file viewing to verify lighting pop, color separation, safe-area layout, and crisp typography.

6. **Close the loop & commit to `main`**:
   - Record findings and metrics (WASM size, bundle size, visual notes) in `docs/specs/01-game-vision.md`.
   - Commit every completed, verified step directly to `main`.
   - Before pushing a milestone release to `origin/main` (GitHub Pages HTTPS), bump `CACHE_NAME` in `public/sw.js`.
