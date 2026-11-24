# Spec 03 — Game Design Philosophy, Polish & Mobile Performance Rubric

- **Status**: `Locked`
- **Last Updated**: 2026-11-24

Every vertical slice of **Pearl Loom** is audited against these concrete craft principles before being committed.

---

## 1. Mark Brown (Game Maker's Toolkit) — Puzzle Craft & Autonomy

- **Zero-Text Onboarding**: Directional arrows are visually clear on every pearl tile; unblocked tiles exhibit a subtle breathing luster so the core rule is understood on the very first tap.
- **No Spoilers, No Timers, No Nagging**: Zero countdown clocks, zero unsolicited hints, zero FOMO mechanics. Hints are strictly opt-in and gently highlight one safe move.
- **Zero Frustrating Softlocks**: Every generated board is mathematically verified solvable **with the 5-slot silk holding tray constraint** in `sim/`. Unlimited 1-tap **Undo** ensures a misstep is effortlessly reversible.

## 2. Nintendo (Miyamoto / Hayashida) — Toy-First Feel & Kishōtenketsu Pacing

- **Toy-First Tactile Juice**:
  - Tapping a free pearl tile: lifts slightly, glides smoothly out in its arrow direction, and arcs gracefully into either its Embroidery Hoop stitch pinhole (sparkling on arrival) or an open Silk Tray dimple.
  - Tapping a blocked pearl tile: soft physical recoil wobble toward the blocker + quiet warm wooden click — tactile feedback without punishment.
  - Auto-stitch cascade: when an active embroidery color completes, the next color activates and any waiting matching pearls in the 5-slot Silk Tray smoothly lift and stitch in a gentle cascade!
- **Kishōtenketsu Difficulty Curve**:
  1. *Introduction* (Artwork 1 — *Heart*, ~9 pearls, 3 colors): instant mastery, ~20–35s solve.
  2. *Development* (Artworks 2–3 — *Blossom*, *Crescent Moon*, 12–16 pearls, 4 colors): silk tray order starts to matter, ~45–75s solve.
  3. *Twist* (Artworks 4–6 — *Butterfly*, *Cozy Cat*, *Seashell*, 18–24 pearls, 5 colors): interlocking directional dependencies create Sudoku-like foresight, ~1.5–2.5 min solve.
  4. *Synthesis* (Artworks 7–8 — *Clover*, *Starlight* + **Endless Procedural Symmetrical Mandalas** + **Daily Stitch**): serene endless craft.
- **Unmistakable Clarity Across All 24 Hours**: High-contrast, distinct pastel pearl hues (Rose, Cream Pearl, Sage, Honey Gold, Lavender, Cerulean) and adaptive frosted HUD surfaces whose ink/backdrop remain effortless to read from sunlit Noon to candlelit Midnight.

## 3. Hideo Kojima — Real-World Solar Link & Diegetic Atmosphere

- **Real-World Clock Connection**: Inspired by *Boktai*'s link to real sunlight, the atelier continuously tracks local time (`hour ∈ [0, 24)`). Sun azimuth/elevation, shadow length, window light color temperature, candle fill light, and procedural musical harmony drift imperceptibly across the day.
- **Diegetic UI**: The raytraced **Embroidery Hoop** *is* the progress bar; the **5-slot Silk Tray** *is* physically recessed into the linen craft desk; the **Active Stitch Swatches** sit cleanly beside/above the hoop like real silk thread bobbins.

## 4. iPhone 16 Performance, Battery & Load-Time Targets

- **Idle-Smart Adaptive Frame Pacing**:
  - `60 FPS` during active animations (pearl flight, blocked wobble, hint pulse, completion shimmer).
  - Automatic calm-idle throttle (`~6 FPS` / `160ms` interval, or paused when backgrounded via `visibilitychange`) when no animations are running — cutting GPU battery drain by >75% while waking instantaneously on `pointerdown`.
- **Spatial Zone Early-Out in WGSL**: Raytrace pixels partition tests across Hoop / Silk Tray / Untangle Board bounding regions so each pixel only intersects nearby pearls instead of all scene objects.
- **Instant Mobile Load**:
  - TinyGo WASM `< 100 KB` (hard budget `< 250 KB`), JS bundle `< 40 KB` gzipped, **zero** external audio/image texture downloads.
