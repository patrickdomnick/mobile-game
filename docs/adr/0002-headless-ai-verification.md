# ADR 0002 — Autonomous Headless Verification via Chromium SwiftShader WebGPU

- **Status**: Accepted
- **Date**: 2026-11-24

## Context

AI agents working in Linux cloud VMs (without a physical GPU or iPhone hardware) must autonomously verify builds, play the game end-to-end, and visually inspect raytraced output.

Empirical testing on this Ubuntu 24.04 VM showed:
- Playwright Chromium (`channel: "chromium"`) exposes a working **WebGPU** adapter, device, and canvas swapchain on `http://localhost` using SwiftShader Vulkan flags (`--enable-unsafe-webgpu --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --enable-features=Vulkan --use-vulkan=swiftshader --ignore-gpu-blocklist`).
- Playwright Linux WebKit exposes WebGL2 only (`navigator.gpu` is `undefined`).

## Decision

1. Use **Playwright Chromium with SwiftShader WebGPU flags** emulating the **iPhone 16** viewport (`393×852`, `3x` DPR, touch enabled) against a local `vite preview` server (`http://localhost`) for automated E2E verification.
2. Expose a read-only telemetry + deterministic tick bridge (`window.__GAME_TEST__`) so AI tests can steer real touch/pointer inputs, assert gameplay outcomes, verify zero WebGPU validation errors, and capture screenshots reliably even under slower software rendering.

## Consequences

- **Pros**: Real WGSL shader compilation, buffer binding, raytracing output, and gameplay loops are verified on every single change in headless CI/cloud VMs.
- **Cons**: Performance benchmarking (true 60 FPS thermal behavior) and Safari-specific Metal quirks still require occasional smoke checks on a physical iPhone 16.
