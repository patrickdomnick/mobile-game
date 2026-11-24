# Pearl Loom — Raytraced Pearl Embroidery & Untangle Puzzle

A relaxing, zero-timer, zero-stress single-screen mobile craft puzzle built for **iPhone 16 (Safari 26+ standalone PWA)**, powered by **TinyGo WebAssembly (`59 KB` raw / `31 KB` gzip)**, **WebGPU (WGSL) real-time raytracing**, and **zero-asset procedural Web Audio**.

## Live HTTPS PWA (GitHub Pages)

- **URL**: https://patrickdomnick.github.io/mobile-game/
- Open in **Safari on iPhone 16** → tap **Share → Add to Home Screen** to install as a full-screen standalone web app.
- Deployed automatically by `.github/workflows/deploy-pages.yml` on `push` to `main` (or manual `workflow_dispatch`).

## Highlights

- **Tactile Untangle + Pearl Embroidery**: Tap unblocked directional pearl tiles to glide & stitch glossy iridescent pearls onto a champagne-brass embroidery hoop, using a 5-slot recessed porcelain silk tray for calm, Sudoku-like planning.
- **Continuous 24-Hour Real-World Solar Lighting**: Smoothly drifts sun angle, shadow length, linen warmth, and evening bedside candlelight with the actual clock (no abrupt theme switches).
- **Zero-Asset Procedural Time-of-Day Soundscape**: Web Audio API generative pentatonic music & harmonious porcelain/pearl foley evolving continuously with the time of day.
- **8 Curated Kishōtenketsu Motifs + Endless Mandalas + Daily Stitch**: Guaranteed 100% solvable under the 5-slot tray constraint, with a persistent local **Pearl Gallery**, unlimited gentle **Undo**, and opt-in **Hint**.
- **iPhone 16 Battery & Load Optimized**: `30.8 KB` gzipped WASM with streaming instantiation & parallel WebGPU boot, spatial WGSL early-outs, and 2-tier calm (`4 FPS`) → deep-idle (`1 FPS`) + Gallery/background (`0 FPS`) rendering.

## Quickstart

```bash
# 1. Install pinned Go (1.26.11), TinyGo (0.44.0), and pnpm dependencies
bash scripts/setup-env.sh

# 2. Run full verification (Go unit & fuzz tests + TinyGo WASM + Vite build + headless WebGPU E2E playtest)
pnpm verify

# 3. Start local dev server
pnpm dev
```
