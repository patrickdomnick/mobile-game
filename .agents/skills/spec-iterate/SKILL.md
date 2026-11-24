---
name: spec-iterate
description: Guides spec-driven iterative development for this mobile raytraced game — updating living specs before coding, building small vertical slices, running autonomous playtests, and recording findings.
---
# Spec-Driven Iteration Workflow

Use this workflow whenever proposing, prototyping, or refining game mechanics, visuals, or technical architecture.

## Steps

1. **Read current truth**:
   - Read `AGENTS.md`, `docs/specs/00-platform-and-tech.md`, `docs/specs/01-game-vision.md`, and `docs/specs/02-verification-and-playtest.md`.
   - Confirm no locked constraint in `00-platform-and-tech.md` is violated.

2. **Write or update the spec delta FIRST**:
   - For exploratory ideas, add or update a section in `docs/specs/01-game-vision.md` with `Status: Prototyping` and explicit **Acceptance Checks** (both simulation assertions and visual/playtest expectations).
   - If making a structural technical choice (e.g., BVH layout, ray bounces, input scheme), write a short ADR in `docs/adr/NNNN-<slug>.md`.

3. **Implement a minimal vertical slice**:
   - Put simulation logic and state transitions in `sim/` (pure Go, deterministic, zero-GC hot loop) with unit tests in `sim/*_test.go`.
   - Pack renderable scene data into the shared `float32` scene buffer; keep WGSL raytracing shaders in `src/renderer/`.
   - Update `window.__GAME_TEST__` only by extending (never breaking) the contract in `docs/specs/02-verification-and-playtest.md`.

4. **Verify end-to-end autonomously**:
   - Run `pnpm verify`.
   - Inspect generated screenshots in `test-results/` visually (using file viewing) to confirm raytracing output looks right (no black screen, NaN artifacts, or clipped safe areas).

5. **Close the loop in the spec**:
   - Record what worked, what felt off, and key metrics (WASM size, frame time, visual notes) in the `Iteration Log` of `docs/specs/01-game-vision.md`.
   - Ask the user whether to lock the mechanic (`Status: Locked`), tweak it, or pivot.
