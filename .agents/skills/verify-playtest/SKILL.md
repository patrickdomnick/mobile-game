---
name: verify-playtest
description: Builds TinyGo WASM and the WebGPU PWA, runs Go unit tests and headless Chromium WebGPU Playwright playtests emulating iPhone 16, and visually inspects rendered screenshots.
---
# Autonomous Build & Playtest Verification

Use this workflow after any code or shader change to prove end-to-end correctness before reporting completion.

## Steps

1. **Run the full verification pipeline**:
   ```bash
   pnpm verify
   ```
   This runs:
   - `pnpm test:go` (`go test ./...` inside `sim/`)
   - `pnpm build:wasm` (`scripts/build-wasm.sh` → `public/game.wasm`)
   - `pnpm typecheck` (`tsc --noEmit`)
   - `pnpm build` (`vite build`)
   - `pnpm test:e2e` (Playwright iPhone 16 + Chromium SwiftShader WebGPU playtest against `vite preview`)

2. **Visually inspect raytraced frames**:
   - Open the screenshots produced under `test-results/` (e.g. `initial-frame.png`, `after-playtest.png`) to confirm:
     - The raytraced scene renders cleanly (lighting, shadows, reflections, no NaN/magenta/black artifacts).
     - The HUD and canvas respect iPhone 16 portrait aspect (`393×852`) and safe-area padding.
     - Touch interactions visibly move/affect the scene as expected.

3. **Check budgets & diagnostics**:
   - Confirm zero console errors, zero page errors, and zero WebGPU uncaptured validation errors.
   - Note the compiled `public/game.wasm` size (keep under 250 KB raw for instant mobile startup).

4. **Report concrete evidence**:
   - Include exact command pass/fail results, WASM binary size, and any visual observations from the captured frames.
