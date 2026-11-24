# Mobile Raytraced Game (iPhone 16 Safari PWA)

A single-screen, hardware-accelerated raytraced mobile game targeting **iPhone 16 (Safari 26+ standalone PWA)**, built with **TinyGo WebAssembly**, **WebGPU (WGSL)**, and **TypeScript + Vite (`pnpm`)**, developed with a **spec-driven iterative agent workflow**.

## Quickstart

```bash
# 1. Install pinned Go (1.26.11), TinyGo (0.44.0), and pnpm dependencies
bash scripts/setup-env.sh

# 2. Run full verification (Go tests + TinyGo WASM build + Vite build + headless WebGPU E2E playtest)
pnpm verify

# 3. Start local dev server (rebuilds WASM first)
pnpm dev
```

## Project Layout

- `AGENTS.md` — Authoritative rules for AI agents working in this repo.
- `.agents/` — Cloud VM environment setup (`environment.json`) and custom project skills (`skills/`).
- `docs/specs/` — Locked platform specs, living game vision spec, and AI playtest contract.
- `docs/adr/` — Architecture Decision Records.
- `sim/` — Deterministic Go / TinyGo WebAssembly game simulation (`go test` + `tinygo build`).
- `src/` — Thin TypeScript + WebGPU WGSL raytracer + iPhone 16 Safari PWA shell.
- `tests/e2e/` — Playwright iPhone 16 + headless WebGPU autonomous playtest suite.
