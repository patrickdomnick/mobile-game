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

## 3. Pearl Loom v2.2 Design Delta (`Status: Locked`)

Informed by real-device playtesting of v2.1:

1. **Remove Noir Monochrome Mode (4 Vivid Native Chapters × 8 = 32 Designs)**:
   - Cut Noir B&W completely across Curated Chapters, Daily Stitch, and Endless Mandala.
   - Keep **4 rich, vibrant native Chapters**: **I · Jewel Atelier** (`0..7`), **II · Cyber Arcade** (`8..15`), **III · Pop Studio** (`16..23`), and **IV · Cathedral Glass** (`24..31`).
2. **Temporary Interior-Only Pearl Glow (Keep Stitchboard Glow)**:
   - Active-color pearls on the board do **not** glow permanently and do **not** emit a cheap outer ring onto the tile.
   - Instead, active pearls softly illuminate **from the inside** (subsurface jewel core radiance) for `~2.2s` ONLY when a puzzle starts or when a new color unlocks, then settle cleanly.
   - The top embroidery hoop stitchboard continues showing clean, anti-aliased active stitch targets throughout the puzzle.
3. **Solo Finale Endgame Unlock Rule**:
   - In a `K`-color puzzle (`K >= 3`), the first 2 colors start unlocked, and each completion unlocks the next color **except** the very last color (`queuePos == K - 1`).
   - The final color is held back until the penultimate color is 100% cleared — making the last two colors unlock **separately** (1 active color at a time) for a genuinely engaging endgame!
4. **Analytic 1-SPP Retina Anti-Aliasing & True 0-FPS Battery Idle**:
   - **Analytic Sphere Edge Coverage + Screen-Space SDF Anti-Aliasing** (`raytrace.wgsl`): Every pearl silhouette blends smoothly against the tile/hoop behind it using analytic ray-sphere closest-approach coverage (`smoothstep` over pixel footprint), making every pearl optically **perfectly round with silky-smooth edges** — alongside screen-space AA on the hoop ring, tray, board frame, tiles, and arrows at `2.0x` hardware DPR with zero MSAA overhead.
   - **True 0-FPS Event-Driven Idle**: Stop syncing WASM buffers 60×/sec when idle (sync real-world solar clock every `15s`), and pause WebGPU rendering completely (**0 FPS**) once animations & the `2.2s` interior unlock glow settle!

---

## 4. Pearl Loom v2.3 Design Delta (`Status: Locked`)

Informed by real-device playtesting of v2.2:

1. **4.0-Second Spotlight + Inactive-Pearl Antipattern Dimming**:
   - Increase initial & new-color-unlock interior highlight duration from `2.2s` to **`4.0s`** (`ColorGlowT` decay `dt * 0.25`, holding crisp peak radiance for `~2.6s` before smoothly easing out).
   - **Antipattern Contrast**: While `ColorGlowT` is active for newly unlocked/starting colors, **non-highlighted board pearls and tile cards darken cleanly into rich shadow** (preserving vivid hue with zero gray washout), creating an unmistakable theatrical spotlight on the target pearls without outer tile halos or visual spoilers — while calming overall resting Jewel & Prism intensity so resting pearls look like natural polished gemstones rather than lightbulbs.
2. **Cyber Arcade & Pop Studio Pearl Material Polish**:
   - **Cyber Arcade (`theme == 1`)**: Replace blown-out rim-lit neon discs with sleek, physically rounded 3D obsidian-glass cyber orbs (true directional spherical volume, subtle controlled neon Fresnel edge, dark grazing falloff for silky anti-aliased silhouettes, and calmer tile border hairlines).
   - **Pop Studio (`theme == 2`)**: Remove the centered white specular dot completely; use clean angled comic-book cel shading (warm top-left crescent, punchy flat primary midtone, darker shadow crescent, and crisp anti-aliased dark ink contour).
3. **Mathematically Proven 3-Star Achievability on 100% of Puzzles**:
   - Upgrade `sim/solver.go` with tray-budgeted search (`solveWithTrayBudget`) so `generateSolvableBoard` guarantees EVERY puzzle (all 32 curated Chapter levels, every Daily date seed, and every Endless/custom user seed) has a verified **3-star winning path** (`UndoUsed == 0 && HintsUsed == 0 && TrayUses <= n/6`).
   - Enforced by automated unit tests in `sim/engine_test.go`.
4. **True Procedural Seed Engine & Custom Seed Input (Daily & Endless)**:
   - Both **Daily Stitch** (`YYYYMMDD` date seed) and **Endless Mode** (fresh random 6-digit seed or any user-entered custom seed) are 100% procedurally generated in `sim/mandala.go` across **5 distinct geometric pattern archetypes** (*Petal Blossom*, *Starburst Crown*, *Golden Spiral*, *Crystal Lattice*, *Orbital Constellation*), varying board sizes (`5×5`–`7×6`), pearl counts (`22–38`), and vibrant themes (`0–3`).
   - Players can view the active seed and **enter any custom seed** (numeric or text) from the Chapters & Seeds drawer to replay or share identical verified 3-star procedural puzzles.

---

## 5. Pearl Loom v2.4 Design Delta (`Status: Locked`)

Informed by real-device playtesting of v2.3:

1. **Pure Additive 3.5s Double-Heartbeat Interior Glow (Default = Zero Glow, Zero Dimming)**:
   - Remove all antipattern darkening/dimming on non-target pearls and tile cards (which previously caused active non-new colors and locked tiles to feel oddly altered).
   - **Calm Non-Glowing Default**: At rest, ALL pearls sit in clean physical diffuse + subtle directional gloss with **zero** artificial self-glow or dimming.
   - **Targeted Interior Pulse Only**: ONLY the 2 starting active colors (at puzzle start) and ONLY a newly unlocked color (on color unlock) illuminate vividly **from inside the sphere** with **2 smooth breathing heartbeats over `3.5s`** (`ColorGlowT` decay `dt * 0.285`), then fade cleanly back to the calm non-glowing default and **0 FPS** idle.
2. **Instant Level Completion Screen (`~0.35s` instead of `~2.2s`)**:
   - Gate `#overlay-complete` on `phase === 'complete' && flyingCount === 0` (the exact moment the final pearl lands on the embroidery hoop!) instead of waiting for `CelebrateT` and all shimmer bursts to decay (`!isAnimating`). The celebratory hoop shimmer continues live behind the completion card.
3. **Real iPhone 16 Safari Taptic Engine Haptics**:
   - Supplement `navigator.vibrate()` (unsupported in WebKit/iOS Safari) with the iOS 17.4+/18+/26+ Safari `<input type="checkbox" switch>` label-click bridge inside [`src/audio/soundscape.ts`](file:///home/antigravity/patrickdomnick/mobile-game/src/audio/soundscape.ts), firing real native Taptic Engine clicks synchronously on tile taps and button presses in standalone Safari PWA mode.

---

## 6. Iteration Log

| Date | Milestone | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slices 0–4 (v1.0) | **Shipped & Playtested** | Real-device playtest revealed: pastel washout, unblocked tile spoilers, boards too small/easy (`3×3`/`4×4`), meaningless move counter, low reward juice, invisible day/night override, and missing Start Menu. |
| 2026-11-24 | **Pearl Loom v2.0 Overhaul** | **Shipped & Playtested** | Full redesign: `uint64` 5×5–7×7 boards, zero-spoiler tiles + blocker pulse, Balatro/VS juice, linear-space PBR across 5 themes, 24h solar override, Start Menu + Settings, plus automated fail-fast ABI/contrast guards & port `5173` WASM hot-reload. |
| 2026-11-24 | **Pearl Loom v2.1 — Chapters, Smart Hints & Active-Target Glow** | **Shipped & Playtested** | 40 patterns across 5 native Chapters, Daily/Endless theme rotation, pinch-rescue Hint (`-2` Undo beacon) + Hint/Undo score deductions, active-target glow. Playtest revealed: Noir mode was unenjoyable, permanent outer pearl glow looked cheap & hurt battery, binary ray-sphere/SDF edges looked jagged, and the final two colors were too easy when unlocked together. |
| 2026-11-25 | **Pearl Loom v2.2 — Retina AA, Solo Finale, Interior Glow & 0-FPS Idle** | **Shipped & Playtested** | Cut Noir (4 vivid Chapters × 8 = 32 designs); interior-only temporary pearl glow; solo finale unlock; analytic 1-spp AA at 2.0x DPR; true 0-FPS idle. Playtest revealed: initial glow too short/subtle vs always-bright pearls, Neon pearls still looked flat/out-of-place, Pop Art pearls had white center dots, some puzzles lacked verified 3-star paths, and Endless/Daily needed richer procedural seed variety + custom seed input. |
| 2026-11-25 | **Pearl Loom v2.3 — Spotlight Antipattern, Material Polish, Guaranteed 3-Star & Seed Input** | **Shipped & Playtested** | Sleek 3D Neon orbs & dot-free Pop Art cel pearls; tray-budgeted solver proving 3-star achievability on 100% of puzzles; 5-archetype procedural seed generator + custom seed input. Playtest revealed: darkening non-target pearls felt reversed/off, completion result screen lagged ~2s waiting for `CelebrateT`, and `navigator.vibrate` is ignored on iOS Safari. |
| 2026-11-25 | **Pearl Loom v2.4 — Pure Additive Interior Pulse, Instant Completion & iOS Safari Taptics** | **Shipped & Verified** | Default zero glow / zero dimming; pure 3.5s double-beat chromatic interior glow strictly on starting & newly unlocked colors; instant `~0.35s` completion modal as final pearl lands; native iOS Safari `<input switch>` Taptic Engine clicks verified via `pnpm verify` + screenshot audit. |

