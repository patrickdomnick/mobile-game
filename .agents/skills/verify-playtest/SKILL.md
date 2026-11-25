---
name: verify-playtest
description: Runs fail-fast ABI/shader contract guards, Go simulation tests, TinyGo WASM build, Vite production build, and headless Chromium WebGPU Playwright playtests (including automated contrast/saturation pixel audits) and visually inspects rendered screenshots.
---
# Autonomous Build & Playtest Verification

Use this workflow after any code, simulation, or shader change to prove end-to-end correctness before reporting completion.

## Steps

1. **Run the fail-fast contract guard first (during rapid edits)**:
   ```bash
   pnpm check:contracts
   ```
   Catches Go/TS/WGSL `SceneData` float mismatches, WGSL reserved keywords (`meta`, etc.), missing `toLinear` linear-space lighting, accidental GPU visual spoiler flags, and broken relative PWA URLs in `< 100ms`.

2. **Run the full verification pipeline** (runs on port `4173`, safe alongside live `pnpm dev` on port `5173`):
   ```bash
   pnpm verify
   ```
   This runs:
   - `pnpm check:contracts` (`scripts/check-contracts.mjs`)
   - `pnpm test:go` (`go test -v ./...` inside `sim/`)
   - `pnpm build:wasm` (`scripts/build-wasm.sh` → `public/game.wasm`)
   - `pnpm typecheck` (`tsc --noEmit`)
   - `vite build` (production bundle)
   - `pnpm test:e2e` (Playwright iPhone 16 + Chromium SwiftShader WebGPU playtest against `vite preview`)

3. **Visually inspect raytraced frames**:
   - Open key screenshots under `test-results/` (`start-menu.png`, `theme-0-jewel.png`, `theme-1-neon.png`, `theme-2-noir.png`, `theme-3-popart.png`, `theme-4-prism.png`, `blocker-feedback.png`, `mid-puzzle-streak.png`, `completed-jewel-heart.png`, `settings-drawer.png`) to confirm:
     - Colors pop with strong figure-ground contrast (no double-gamma washout or grey fog).
     - All directional arrows are razor-sharp and identical across blocked/unblocked tiles (zero visual spoilers).
     - Noir B&W geometric inlays match HUD swatches cleanly.
     - All buttons and modals fit iPhone 16 portrait safe areas (`393×852`) with zero clipping.

4. **Check budgets & diagnostics**:
   - Confirm zero console errors, zero page errors, zero HTTP >= 400 responses, and zero WebGPU validation errors.
   - Verify automated pixel contrast/saturation gates pass across Jewel, Neon, Noir B&W, and Pop Art themes.
   - Confirm `public/game.wasm` stays lean (< 100 KB raw target, < 250 KB hard budget) and DOM-only animations never wake the 3D GPU loop.

5. **Report concrete evidence**:
   - Include exact command pass/fail results, WASM & gzipped bundle sizes, and visual observations from the inspected screenshots.
