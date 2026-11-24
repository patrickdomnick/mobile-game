# Spec 00 — Platform, Device, and Technology Constraints

- **Status**: `Locked`
- **Owner**: Patrick Domnick
- **Last Updated**: 2026-11-24

---

## 1. Target Hardware & Browser

- **Primary Device**: iPhone 16
  - Logical viewport: `393 × 852` CSS pixels, portrait orientation (`devicePixelRatio = 3`, native `1179 × 2556`).
  - Safe areas: Dynamic Island (top inset) and Home Indicator (bottom inset) must never clip interactive UI or essential game information.
  - GPU: Apple A18 GPU (hardware-accelerated graphics + compute via Metal backend under Safari WebGPU).
- **Primary Browser**: iOS Safari 26+ (WebGPU enabled by default).
- **Installation Mode**: Standalone Web App (PWA) installed via Safari **Share → Add to Home Screen**:
  - `manifest.webmanifest` with `display: "standalone"`, `orientation: "portrait"`, theme/background colors, and icons.
  - Apple Safari meta tags: `apple-mobile-web-app-capable="yes"`, `apple-mobile-web-app-status-bar-style="black-translucent"`, `viewport-fit=cover`, `apple-touch-icon`.
  - Service Worker caching core shell + `.wasm` assets for fast cold launch and offline playability.

## 2. UX Shell Constraints

- **Single-Screen Game**: Zero page scrolling, zero pull-to-refresh, zero accidental pinch-zoom or text selection (`touch-action: none`, `overscroll-behavior: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`).
- **Dynamic Resolution Scaling**: Canvas backing buffer may scale dynamically (e.g., `1.0x–2.0x` DPR cap on mobile) to maintain smooth `60 FPS` during real-time raytracing without thermal throttling.

## 3. Core Technology Stack

| Layer | Technology | Version / Notes |
| :--- | :--- | :--- |
| Simulation / Game Logic | Go compiled with **TinyGo** to WebAssembly | Go `1.26.11`, TinyGo `0.44.0` (`-target=wasip1 -buildmode=c-shared`) |
| Raytracing & GPU Acceleration | **WebGPU** + **WGSL** shaders | Compute or full-screen raytracing pipeline; storage/uniform scene buffers |
| Web Shell & Bundler | TypeScript + Vite | Managed exclusively via `pnpm` |
| Version Control | Git + GitHub | Repo-scoped `.agents/environment.json` |
| Autonomous E2E Verification | Playwright (Chromium SwiftShader WebGPU) | iPhone 16 viewport + touch emulation |

## 4. Hosting & Release Delivery

- **Live HTTPS URL**: `https://patrickdomnick.github.io/mobile-game/` (GitHub Pages deployed via `.github/workflows/deploy-pages.yml` on `push` to `main` or manual `workflow_dispatch`).
- **Subpath Portability**: All build and PWA asset paths MUST remain relative (`base: './'`, `./game.wasm`, `./manifest.webmanifest`, `./sw.js`) so the same bundle runs seamlessly at both `http://localhost:4173/` and `/mobile-game/`.
- **Workflow Cadence**: Commit every verified step directly to local `main`; push to `origin/main` for milestone releases or real iPhone 16 HTTPS verification (not during rapid inner-loop edits).

## 5. Non-Functional Budgets

- **Compiled WASM binary size**: `< 250 KB` raw (target `< 100 KB` for instant load over mobile networks).
- **Simulation determinism**: Fixed-timestep `Step(dt)` in pure Go; zero per-frame heap allocations in the hot update loop.
- **Zero runtime errors**: Zero console errors, zero uncaught exceptions, zero WebGPU validation errors on boot and throughout gameplay.
