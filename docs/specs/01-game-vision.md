# Spec 01 — Game Vision & Mechanics: **Pearl Loom v2.0** (Living Spec)

- **Title**: **Pearl Loom**
- **Status**: `Locked` (v2.0 Rework)
- **Last Updated**: 2026-11-24

> **Pearl Loom** is a vibrant, deeply satisfying, zero-timer tactile puzzle craft game for iPhone 16 — fusing the honest spatial deduction of *Arrow Jam* & *Sudoku*, the juicy escalating reward stack of *Balatro* & *Vampire Survivors*, and real-time **WebGPU raytraced** jewelry/embroidery art across 5 distinct visual themes and a continuous 24-hour real-world solar cycle.

---

## 1. Core Design Pillars (`Status: Locked`)

1. **Honest Deduction — Zero Visual Spoilers**:
   - Every tile on the untangle board renders with identical crispness and a permanent, sharp directional chevron arrow (`▲ ► ▼ ◄`). Free tiles are NEVER given away visually.
   - Tapping a blocked tile clearly shows *why* via a physical recoil lunge + brief highlight pulse on the exact blocking neighbor.
2. **Rich, Substantive Multi-Layer Puzzles (`5×5` → `7×7`, `21–45` Pearls)**:
   - Upgraded 64-bit simulation (`MaxGridTiles = 49`, `MaxHoopPearls = 49`) supporting larger, deeper, genuinely engaging puzzles organized into **3 Embroidery Layers** (*Core*, *Mid Ring*, *Outer Crown*).
3. **Balatro × Vampire Survivors Reward & Tension System**:
   - **Direct-Stitch Clean Streak & Multiplier (`×1 → ×12`)**: Stitching directly without touching the 5-slot tray builds your multiplier, scales micro-screenshake & haptics, climbs harmonic audio pitch, and pops floating callouts (`+300 ×3!`).
   - **Color Clear & Tray Cascade**: Completing an active color launches a luminous hoop shockwave, pulses the background lighting with that jewel's color, awards `+500`, and triggers a staggered Balatro-style cascade draining waiting tray pearls!
   - **Layer / Ring Complete Bonus**: Completing a full embroidery ring triggers a golden wave across the desk, harp fanfare, and `+750 RING BONUS`.
   - **Subtle Tray Tension**: Filling slots `3/5` → `4/5` → `5/5` escalates a rhythmic warm/crimson tension glow on the tray rim and subtle low harmonic pulse.
   - **Meaningful Mastery (No Move Counter)**: Awards **Luster Score**, **Peak Streak**, **Clean %**, and **1–3 Stars (`★–★★★`)** saved in the Gallery.
4. **High-Pop Jewel Graphics & 5 Distinct Visual Themes**:
   - **0 — Jewel Atelier (Default)**: Rich warm espresso-walnut desk, luminous ivory hoop cloth, vivid jewel-enamel pearls (Ruby, Cobalt, Emerald, Solar Gold, Amethyst, Turquoise) with crisp specular highlights & shadows.
   - **1 — Cyber Neon**: Deep midnight cyber-grid desk, glowing neon cyan/magenta tubes, chrome reflections, radiant emissive neon pearls.
   - **2 — Noir Monochrome (B&W)**: High-contrast Art-Deco black & white with 6 distinct geometric pearl inlays (Solid White, Solid Black, Ring, Double Band, Split Half, Diamond) for 100% monochrome readability.
   - **3 — Pop Art**: Vibrant comic halftone yellow/blue backdrop, bold ink-black borders, punchy Warhol primary colors.
   - **4 — Stained Glass**: Cathedral midnight-teal desk with jewel-like glowing colored light pools.
5. **Real-World 24-Hour Solar Day/Night Cycle (Default Auto + User Override)**:
   - Syncs continuously to the local clock by default (`Auto`) across all themes, transforming sun/moon angle, light warmth, twilight dusk, starlight/candlelight, and procedural audio.
   - Users can override or scrub any hour (`00:00 – 23:59`) live in **Settings** (or return to `Auto` real-time sync with one tap).
6. **Living Start Menu, Mode Selector & Settings**:
   - Vibrant tactile Start Menu floating over the live raytraced 3D scene with Mode Selector (**Journey**, **Daily Stitch**, **Endless Mandala**), instant **Visual Theme Switcher**, and **Settings** (24h Solar Override slider, Theme, Sound, Haptics/Screenshake).

---

## 2. Iteration Log

| Date | Milestone | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slices 0–4 (v1.0) | **Shipped & Playtested** | Real-device playtest revealed: pastel washout, unblocked tile spoilers, boards too small/easy (`3×3`/`4×4`), meaningless move counter, low reward juice, invisible day/night override, and missing Start Menu. |
| 2026-11-24 | **Pearl Loom v2.0 Overhaul** | **In Progress** | Full redesign addressing every single playtest finding: `uint64` 5×5–7×7 boards, zero-spoiler tiles + blocker pulse, Balatro/VS score/mult/streak/layer/cascade/shake/haptics juice, 5 high-pop raytraced themes, visible 24h solar override slider, and vibrant Start Menu + Settings. |
