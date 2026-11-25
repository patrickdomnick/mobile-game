# Spec 03 — Game Design Philosophy, Juice Stack & Mobile Polish (v2.0)

- **Status**: `Locked`
- **Last Updated**: 2026-11-24

Every system in **Pearl Loom** is audited against these concrete principles drawn from **Balatro**, **Vampire Survivors**, **Mark Brown (GMTK)**, **Nintendo**, and **Hideo Kojima**.

---

## 1. Balatro — The Layered Juice Stack & Score as Teaching Tool

> *"Remove all layers of the juice stack and you have a spreadsheet. Feedback is not polish — feedback IS the product."*

- **Meaningful Scoring (Never "Took X Moves")**:
  - Solving an N-pearl board always removes N tiles — so raw move count is meaningless. Instead, players chase **Luster Score**, **Clean-Stitch Streak Multiplier (`×1 → ×12`)**, **Tray-Free Direct Efficiency**, **Color-Clear & Layer-Clear Bonuses**, and **★★★ Pure Craft Mastery**.
- **The 5-Layer Juice Stack on Every Stitch**:
  1. **Tactile Flight**: Pearl launches sharply in its arrow direction and arcs onto its hoop pinhole with spring bloom.
  2. **Rolling Score & Floating Callouts**: Score counter rolls smoothly upward; floating color-coded callouts (`+300 ×3!`, `COLOR CLEAR +500!`, `RING COMPLETE +750!`) pop directly where the action happened, teaching *why* the player earned big points.
  3. **Magnitude-Scaled Screenshake & Haptics**: Subtle micro-shake scales with multiplier/milestone (tiny crisp snap on single stitch, punchy thrum on Color Clear / Layer Complete) paired with `navigator.vibrate` haptics.
  4. **Background & Lighting Reaction**: Completing a color or embroidery ring sends a luminous **radial light shockwave** across the raytraced hoop and briefly bathes the atelier background in that jewel's color aura!
  5. **Rising-Pitch Escalating Audio**: Every consecutive direct stitch climbs a harmonic pitch step (Balatro's rising tick!), turning streaks and tray cascades into musical crescendos.

## 2. Vampire Survivors — Escalating Milestones & Delicious Tension

- **Frequent Micro-Rewards → Big Milestone Payoffs**:
  - Every direct stitch builds multiplier; every **Color Clear** triggers a staggered cascade draining waiting pearls out of the silk tray; every **Embroidery Ring / Layer** completed unleashes a golden shockwave fanfare!
- **Subtle Tray Tension**:
  - As the 5-slot silk tray fills (`3/5` warm amber glow → `4/5` rhythmic heartbeat tension rim + low harmonic hum → `5/5` urgent shimmer), the player feels engaging, non-punishing tension — making a multi-pearl cascade drain feel genuinely euphoric.

## 3. Mark Brown (GMTK) & Nintendo — Zero Spoilers, Honest Deduction & Clarity

- **Never Spoil Unblocked Tiles**: Every alive board tile renders with **identical crispness and an equally sharp, bold directional arrow (`▲ ► ▼ ◄`)**. The player deduces clear paths honestly — the game never gives away answers by dimming blocked tiles or hiding arrows.
- **Crystal-Clear Causal Feedback**: Tapping a blocked tile physically lunges toward its **exact blocking tile** and briefly flashes a crisp **blocker pulse/beam** between the tapped tile and the blocker so the player immediately sees *why* it couldn't escape.
- **Substantial, Satisfying Boards**: Boards scale from **5×5 (21–25 pearls)** up to **7×7 (45 pearls)** across 3 embroidery layers, verified 100% solvable under the 5-slot tray constraint.
- **High-Pop Visual Separation + 5 Visual Themes**: Unmistakable jewel-tone chroma on high-contrast craft tables, plus **Cyber Neon**, **Noir Monochrome (with geometric B&W pearl patterns)**, **Pop Art**, and **Stained Glass**.

## 4. Hideo Kojima — Real-World Solar Link & Player Control

- **Default Real-World 24h Day/Night Sync + User Override**: Syncs automatically to the local clock by default (visibly transforming lighting, sun angle, twilight warmth, night starlight/candlelight, and generative audio across all themes), with a live **24-Hour Solar Slider & Auto Toggle** in Settings so the player can scrub or lock any hour at will.
