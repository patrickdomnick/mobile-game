# Spec 01 — Game Vision & Mechanics (Living Spec)

- **Status**: `Draft` (Iterative — mechanics intentionally open for exploration)
- **Last Updated**: 2026-11-24

> This is a **living document**. Sections move through `Draft` → `Prototyping` → `Locked` (or `Discarded`) as we test playable vertical slices and inspect autonomous playtest screenshots.

---

## 1. High-Level Direction (`Status: Draft`)

- **Format**: Single-screen portrait game designed for quick one-handed or two-thumb sessions on iPhone 16.
- **Visual Identity**: Real-time raytraced 3D showcase — crisp mirror/metallic reflections, soft shadows, emissive accents, and tactile physics that feel impossible for a tiny web app.
- **Open Design Questions** (to iterate on next):
  1. **Core Loop / Genre**: Arcade physics (e.g., raytraced marble/pinball/tilt/billiard), spatial puzzle (mirror/laser/light-bending), or endless reflex dodge/catch?
  2. **Primary Control Scheme**: Direct touch-drag, tap-impulse/slingshot, or hold-and-steer?
  3. **Session Structure**: Score attack with rising intensity, handcrafted stages, or zen sandbox?

---

## 2. Vertical Slice 0 — "Hello Raytracer" Verification Prototype (`Status: Prototyping`)

Before locking game mechanics, Slice 0 proves the entire stack end-to-end:

### Gameplay & Interaction
- A raytraced 3D arena rendered in real time via **WebGPU (WGSL)**:
  - Checkered reflective floor plane with soft raytraced shadows and sky/horizon gradient.
  - A player-controlled glowing metallic/glass **Orb** (controlled via touch/drag anywhere on the iPhone 16 screen) that smoothly accelerates toward the touch target and bounces cleanly off arena bounds.
  - **Collectible Gem Spheres** orbiting/bobbing in the arena with specular reflections. Colliding the Player Orb with a Gem increments `score`, spawns a brief pulse/flash, and relocates the Gem deterministically.
- Minimal safe-area-aware HUD showing `SCORE` and a subtle `RESET` button.

### Acceptance Checks
1. TinyGo WASM owns player position, velocity, gem position, collision detection, score, and flat `float32` scene buffer generation.
2. WebGPU WGSL raytracer reads the WASM scene buffer and renders multi-bounce reflections + shadow rays every frame.
3. Touch/drag input moves the player orb toward the target; an autonomous Playwright AI agent can read player/gem coordinates via `window.__GAME_TEST__`, steer the orb into the gem via touch events, and verify `score >= 1`.
4. Screenshots show a clear, colorful, non-black raytraced 3D scene with reflections and shadows.

---

## 3. Iteration Log

| Date | Slice / Experiment | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slice 0 — Hello Raytracer | **Verified (Pass)** | `42 KB` TinyGo WASM (`wasip1 c-shared`), 3-bounce WebGPU WGSL raytracer with reflections + cast shadows, 0 validation errors, autonomous iPhone 16 headless playtest scored `2` and reset cleanly. |
