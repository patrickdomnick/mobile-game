# ADR 0001 — TinyGo WASM Simulation + WebGPU WGSL Raytracer Split

- **Status**: Accepted
- **Date**: 2026-11-24

## Context

We want a single-screen, real-time raytraced mobile game for iPhone 16 (Safari 26+ standalone PWA) written with Go/TinyGo WebAssembly and utilizing hardware acceleration.

CPU-only raytracing inside WebAssembly cannot sustain high-resolution 60 FPS raytracing with reflections and soft shadows on a mobile phone without heavy battery/thermal drain. Meanwhile, Safari 26 / iOS 26 ships **WebGPU** enabled by default on iPhone 16 (A18 GPU / Metal backend).

## Decision

1. **TinyGo WASM (`sim/`, `-target=wasip1 -buildmode=c-shared`)** owns 100% of game state, physics, collision detection, scoring, and scene serialization into a flat `float32` linear-memory buffer.
2. **Raw WASM exports (`//go:export`) without `syscall/js`**: avoids `wasm_exec.js` overhead, keeps binary size tiny (~10–50 KB), and allows zero-copy typed-array reads from `WebAssembly.Memory`.
3. **WebGPU WGSL (`src/renderer/raytrace.wgsl`)** executes hardware-accelerated raytracing directly on the GPU, consuming the flat scene buffer via `device.queue.writeBuffer` once per frame.

## Consequences

- **Pros**: True GPU-accelerated raytracing on iPhone 16; deterministic Go simulation testable natively via `go test`; tiny instant-loading WASM binary; zero GC pressure across the JS↔WASM boundary.
- **Cons**: Requires iOS 26+ / Safari 26+ (or WebGPU-enabled browser); WGSL shader code lives alongside TypeScript rather than inside Go.
