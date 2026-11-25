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

## 2. Pearl Loom v2.1 Design Delta (`Status: Locked`)

Informed by real-device playtesting of v2.0:

1. **Smart Pinch-Rescue Hint & Fair Score Deduction (Limitless Hint & Undo)**:
   - Upgrade solver with priority-ordered search (preferring tray moves that directly unblock active colors or match the next queued color) and larger visited table (`8192`) so complex mid-game boards solve reliably.
   - **Never-Silent Hint / Dead-End Rescue**: If the player works themselves into a genuine unsolvable dead-end pinch (requiring backtracking), `ComputeHint()` detects the dead end, returns `-2` (`HintNeedsUndo`), highlights the **Undo ↶** button with a golden rescue pulse, and displays `"Pinch! Tap Undo ↶"`. If solvable (or still open), Hint always highlights the optimal next tile.
   - **Risk/Reward Mastery**: Both **Hint** (`-250` Luster Score) and **Undo** (`-150` Luster Score, resets streak) remain 100% limitless in use while deducting points (clamped at 0) so players can never get permanently stuck yet pure mastery is rewarded.
2. **Active-Color Visual Clarity (Zero Spoilers)**:
   - **On the Board**: All alive pearls matching an **active target color** (both blocked and unblocked — preserving 100% zero-spoiler deduction!) receive a non-spoiler `flags |= 16` active-target flag, rendering a luminous breathing halo ring + heightened rim glow so your eyes lock onto target pearls without glancing at the top-left HUD.
   - **On the Embroidery Hoop**: Active-color unstitched pinholes display bright pulsing concentric target beacons, while inactive future pinholes stay calm and muted.
   - **On the HUD**: Active stitch swatches pulse gently to connect the hoop, board, and swatches as one unified visual language.
3. **Native In-Built Thematic Chapters ("Ateliers") — Not a Manual Setting**:
   - Themes are removed from manual Settings/Start Menu toggles and promoted into **5 Curated Chapters × 8 Theme-Matched Patterns = 40 Handcrafted Levels**:
     - **Chapter I — Jewel Atelier** (`0..7`, Theme 0): Gemstone & nature brooches (`5×5` → `7×7`, 21–42 pearls).
     - **Chapter II — Noir Salon** (`8..15`, Theme 2): **Intentionally calmer/easier** monochrome Art-Deco silhouettes (`4×4` → `5×5`, 16–25 pearls, strictly 3–4 geometric B&W pearl types — never cluttered 6-color rainbows).
     - **Chapter III — Cyber Arcade** (`16..23`, Theme 1): Synthwave & neon cyber motifs (`5×5` → `7×6`, 24–38 pearls).
     - **Chapter IV — Pop Studio** (`24..31`, Theme 3): Bold Warhol/comic motifs (`5×5` → `7×6`, 24–38 pearls).
     - **Chapter V — Cathedral Glass** (`32..39`, Theme 4): Grand stained-glass rose windows & prisms (`6×5` → `7×7`, 28–45 pearls).
   - **Daily Stitch & Endless Mandala**: Automatically pick a theme per date/seed (deterministic by calendar date for Daily Stitch, varied per seed for Endless Mandala), adapting pearl count & color count automatically when Noir B&W is rolled!
4. **Graphics & Streamlining Polish**:
   - Crisp 3D tile edge bevel shading + soft contact ambient occlusion beneath every pearl on tiles and hoop.
   - Streamlined Start Menu (Hero + Active Chapter progress + Mode Selector with Daily Theme badge + Chapter Gallery + Clean Settings for 24h Solar Cycle, Sound, Haptics).

---

## 3. Iteration Log

| Date | Milestone | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slices 0–4 (v1.0) | **Shipped & Playtested** | Real-device playtest revealed: pastel washout, unblocked tile spoilers, boards too small/easy (`3×3`/`4×4`), meaningless move counter, low reward juice, invisible day/night override, and missing Start Menu. |
| 2026-11-24 | **Pearl Loom v2.0 Overhaul** | **Shipped & Playtested** | Full redesign: `uint64` 5×5–7×7 boards, zero-spoiler tiles + blocker pulse, Balatro/VS juice, linear-space PBR across 5 themes, 24h solar override, Start Menu + Settings, plus automated fail-fast ABI/contrast guards & port `5173` WASM hot-reload. |
| 2026-11-24 | **Pearl Loom v2.1 — Chapters, Smart Hints & Active-Target Glow** | **Locked & Shipped** | 40 handcrafted patterns across 5 native Chapters (Noir Salon calmer with 3–4 B&W types), Daily/Endless theme rotation, priority pinch-rescue Hint (`-2` Undo beacon) + limitless Hint (`-250`) / Undo (`-150`), active-color glow on board pearls & hoop target beacons, 3D tile bevels & pearl contact AO. |

