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

## 6. Pearl Loom v2.5 Design Delta (`Status: Locked`)

Informed by real-device playtesting of v2.4:

1. **Playful Active-Color Pearl Wiggles (Zero-Spoiler & Battery-Smart)**:
   - **On Level Load & On New Color Unlock**: All alive board pearls matching the newly active color(s) perform a joyful, bouncy 3D wiggle + tiny hop right on their tile (the tile card stays still while only the pearl sphere itself shimmies!). Never wiggles non-active colors.
   - **Periodic Ambient Active-Color Wiggle (~every 1.25s during play)**: Randomly chooses **1 alive pearl** of any currently active stitch color (completely independent of whether it is blocked or optimal — 100% zero-spoiler!) and gives it a charming ~0.48s wiggle + hop. Between wiggles (and on Start Menu / drawers / completion), the GPU still sleeps at **true 0 FPS** to protect iPhone 16 battery life.
2. **1-to-1 Color-Matched 3D HUD Swatches & Distinct Palette Separation**:
   - Sharpen hue separation across all 4 vibrant theme palettes (`sim/artworks.go`) — e.g. true Scarlet Ruby vs Amethyst in Jewel Atelier, vivid Flame Red vs Magenta/Amber in Cyber Arcade, crisp Green vs Cyan/Blue across all themes — so every color is unmistakable at a glance.
   - Replace muddy dark-inset flat HUD dots with **ACES-matched miniature 3D radial-gradient pearl swatches** (`hiHex` / `hex` / `loHex` + theme-matched rims such as ink-black borders in Pop Studio) so every swatch in the top-left `STITCH` pill looks like an exact miniature copy of the raytraced 3D pearl on the board below.

---

## 7. Pearl Loom v2.6 Design Delta (`Status: Locked`)

Informed by real-device iPhone 16 Safari playtesting of v2.5:

1. **iOS 26.5+ Direct-Tap Native Taptic Engine Haptics**:
   - Apple WebKit in iOS 26.5 patched programmatic `label.click()` calls on hidden `<input type="checkbox" switch>` elements.
   - Render a viewport-resident transparent `<input id="ios-haptic-switch" type="checkbox" switch>` (`opacity: 0.001`, native appearance intact) paired with a transparent `<label id="canvas-haptic-layer" for="ios-haptic-switch">` over the gameplay canvas and clipped transparent `<label>` overlays on primary interactive buttons, plus a 1-tap **Test Haptic** label in Settings — so real trusted finger taps directly toggle the native iOS switch and fire a crisp Taptic Engine click. Keep `navigator.vibrate()` for Android Chrome/Edge.
2. **Bulletproof iOS Safari Web Audio (`audioSession: 'playback'` + Self-Healing Watchdog)**:
   - Configure `navigator.audioSession.type = 'playback'` so in-game chimes play reliably even when the iPhone hardware Silent switch / Action Button is enabled (controlled cleanly by the in-game `♪` mute toggle).
   - Handle BOTH `'suspended'` and WebKit's `'interrupted'` states across gestures, app switching, `visibilitychange`, `pageshow`, and `focus`.
   - Add a frozen-`currentTime` watchdog (WebKit Bug #263627) + silent 1-sample `AudioBufferSourceNode` & silent WAV `<audio>` kick on unlock so audio self-heals automatically on tap without ever requiring page reloads or hardware volume presses.
3. **Calm, Delayed Pearl Wiggle Choreography**:
   - Delay active-color pearl wiggles by **`+0.70s`** on level load and **`+0.85s`** on mid-game color unlock (`Tile.JiggleDelay`) so the fresh board, flying pearls, and Color Clear celebrations breathe first before gently drawing the eye to the active/newly unlocked pearls.
   - Soften wiggle motion to 2 smooth playful bounces (`~0.54s`) and relax the periodic ambient single-pearl wiggle to every **`3.0s`** with a **`2.5s` quiet-hand cooldown** after any player tap (100% zero-spoiler, 0 FPS between wiggles).
4. **In-App iOS 26 Safari PWA Install Guide**:
   - Detect standalone mode (`display-mode: standalone` / `navigator.standalone`); when running in a browser, display a sleek **"Install on Home Screen"** card in Settings and compact Start Menu pill opening a 3-step visual guide for **iOS 26 Safari (`•••` → Share → Add to Home Screen → Open as Web App)** (plus native `beforeinstallprompt` on Android/Desktop Chromium). Auto-hides once installed.

---

## 8. Pearl Loom v2.7 Design Delta (`Status: Locked`)

Informed by real-device standalone PWA playtesting of v2.6:

1. **True Edge-to-Edge Standalone iOS PWA Full-Screen Fix**:
   - Fix the iOS standalone PWA bottom black chin caused by `100dvh` + `height: 100%` shrinking short of the Home Indicator safe area under `viewport-fit=cover` + `black-translucent`.
   - Use `@media (display-mode: standalone)` + `.is-standalone` rules (`height: 100vh; min-height: 100lvh; min-height: calc(100dvh + env(safe-area-inset-bottom, 0px))`), dynamic `visualViewport` resize hooks, and `Math.max(rect.height, window.innerHeight)` in `WebGPURaytracer.resize()`.
2. **Cleaner, Warmer, Less-Technical UI**:
   - Remove the Start Menu `+ Install` pill (keeping **Install on Home Screen** cleanly inside Settings; iOS Safari does not allow web apps to automate Add to Home Screen).
   - Remove the redundant Start Menu Time button (`#btn-menu-solar` & `#btn-menu-open-settings`) so Settings lives in one unmistakable spot (`⚙`).
   - Replace technical labels (`Raytraced`, `Procedural · Seed`, `Luster Score`, `Direct Craft`) with warm, cozy craft language.
3. **Bonus Heart Pearls (Up to 3 per Level)**:
   - Spawn 1–3 special **Heart Pearls** per level (`Tile.IsHeart`, encoded on GPU via bit 5 `flags |= 32` with zero ABI change).
   - Rendered with a crisp contrast-adaptive analytic ♥ emblem directly on the pearl sphere (preserving underlying color readability on every light & dark pearl!) and periodically wiggling to invite early placement.
   - **Early-Placement Bonus**: Placing a Heart Pearl early awards up to **`+600` bonus points** (scaling linearly down to `+150` based on remaining pearls when placed), paired with a floating `♥ HEART +N!` callout and a brand-new warm crystalline **Heart Chime** sound effect (`HeartClearEvents`).
4. **Remote-Fetchable & Offline-Cached Curated Levels JSON (`public/levels.json`)**:
   - Represent all curated levels in `public/levels.json` (fetched network-first on startup, cached in Service Worker + `localStorage` for offline play, with compiled fallback).
   - Load JSON levels dynamically into WASM via a zero-alloc flat staging buffer (`sim_custom_level_ptr` / `sim_load_custom_level`) so new or updated levels can be pushed to the server without rebuilding or updating the app binary.
   - Gallery UI, Chapter counts, and Journey progression react dynamically to the loaded catalog.
5. **200-Level 4-Campaign Architecture Plan (Plan Only — Not Yet Built)**:
   - Captured in [`docs/specs/03-campaign-200-plan.md`](file:///home/antigravity/patrickdomnick/mobile-game/docs/specs/03-campaign-200-plan.md) for review before authoring all 200 levels.

---

## 9. Pearl Loom v2.8 Design Delta — Campaign Testrun (`Status: Locked`)

Validating the core **4-Campaign Progressive Philosophy** before generating the full 200-level catalog (see [`docs/specs/03-campaign-200-plan.md`](file:///home/antigravity/patrickdomnick/mobile-game/docs/specs/03-campaign-200-plan.md)):

1. **4 Independent Campaigns × 13 Levels = 52 Curated Levels (Testrun)**:
   - All 4 themed campaigns (**Jewel Atelier**, **Cyber Arcade**, **Pop Studio**, **Cathedral Glass**) are unlocked from Day 1 with independent progress.
   - Instead of 5 levels per size tier (200 total), this testrun ships **1 level per tier step + 2 zero-blocker warm-ups = 13 levels per campaign**:
     - `L1–L2`: `5×5` Warm-Ups (**`NoBlockers: true`**, 100% direct outward placement, `14` & `16` pearls)
     - `L3`: `5×5` First Weave (`Difficulty 1`) → `L4`: `6×5` (`2`) → `L5`: `6×6` (`3`) → `L6`: `7×6` (`4`) → `L7`: `7×7` (`5`) → `L8`: `8×6` (`6`) → `L9`: `8×7` (`7`) → `L10–L13`: `8×8` Artisan / Virtuoso / Expert / Masterpiece (`8 → 11`, up to **64 pearls**).
   - **Monotonic Difficulty**: Difficulty strictly escalates from Level 3 → Level 13 (higher inward-arrow ratio, deeper interlocking chains, wider color-order scramble, more colors `3 → 6`, larger grids) without ever resetting when grid dimensions increase. Every single level is mathematically verified **100% 3-star achievable**.
2. **Full `8×8` (64-Tile) Engine & WebGPU Raytracer Upgrade**:
   - Raise `MaxGridTiles` & `MaxHoopPearls` from `49 → 64`, expanding `SceneFloats` cleanly from `1008 → 1248` (`4,992` bytes) across Go, TypeScript, and WGSL (guarded by `pnpm check:contracts`).
   - Move `solverVisited` (with O(1) generation-stamped reset + dedicated `trayUses` byte tag) and per-depth DFS scratch arrays to static BSS memory so 64-pearl `8×8` solves run in <5 KB of TinyGo WASM stack with zero collisions and zero heap allocations.
   - Scale hoop pearl radius cleanly for 51–64 pearl embroidery hoops (`0.090`) so dense `8×8` masterpieces never overlap.
3. **Sequential Level Locking & Campaign-First UI**:
   - Level 1 of every campaign is playable on Day 1; Level `k` (`k >= 2`) stays locked (`🔒`) until Level `k - 1` in that same campaign is completed.
   - **Start Menu**: Features a tactile 4-Campaign world switcher right on the home screen (switching the live 3D background board immediately), a focused Campaign Hero CTA showing level progress + grid/tier badge, a `View Levels` button, and a clean compact `Daily Stitch` / `Endless` row below.
   - **Campaigns Drawer**: Elevates the 4 Campaign tabs, per-campaign progress bar + star count, and numbered `01–13` progression cards (Completed / Current Play / Locked) front-and-center, with Daily, Endless & Pattern Code cleanly tucked beneath.

---

## 10. Pearl Loom v2.9 Design Delta — Special Pearls, Live `config.json` & Seeded Difficulties (`Status: Locked`)

Finalizing the full gameplay feature suite before mass-producing the 200-level campaign (`8×8` locked as absolute maximum board size for iPhone 16 touch comfort):

1. **Remote-Fetchable & Offline-Cached Live Tuning (`public/config.json`)**:
   - Network-first fetch with Service Worker + `localStorage` offline cache and compiled defaults.
   - Exposes live tuning knobs without rebuilding the app: `jiggle` (`intervalMs`, `quietHandMs`, `rainbowIntervalMs`, `loadDelaySec`, `unlockDelaySec`, `intensity`), `lighting` (`topLightIntensity`, `glowIntensity`), `feedback` (`shakeIntensity`, `rumbleIntensity`), and `scoring` (`heartBonusMax`, `heartBonusMin`, `hintPenalty`, `undoPenalty`).
2. **True 3D Sculpted Heart-Shaped Pearl**:
   - Heart Pearls are raymarched as real plump 3D sculpted heart gemstones (`sdHeartPearl3D` + 4-tap normals + subpixel silhouette AA inside a fast bounding-sphere reject), lit with full theme PBR shading — not a flat icon pasted on a sphere.
3. **Full Special Pearl Suite (Gradual Campaign Rollout + Individual Audio)**:
   - **Campaign Rollout (zero overwhelm)**: L1–L2 no specials → L3–L4 Hearts (`♥`) → L5–L6 + Rainbow (`🌈`) → L7–L8 + Hidden (`?`) → L9–L13 + Locked (`🔒`).
   - **Rainbow Wild Pearl (`🌈`)**: Matches any currently active hoop color (direct stitch, never takes a tray slot); spawns as an extra board tile so 1 surplus pearl of that color either stays on the field or lands in the tray; level completes as soon as all hoop stitches are filled; has its own independent jiggle timer (`rainbowIntervalMs`) and prismatic arpeggio sound effect.
   - **Hidden Pearl (`?`)**: Concealed as a glossy obsidian-black pearl until it can be stitched (`unblocked && activeColor`), then permanently flips to its true color with a glassy reveal chime.
   - **Locked Pearl (`🔒`)**: Cannot be used while any of its 4 orthogonal adjacent tiles (`N/E/S/W`) holds an alive pearl; displays a crisp 4-side directional clasp overlay showing only the remaining active neighbor links that snap off one-by-one until all 4 are clear, triggering a metallic latch-release chime.
4. **4 Seeded / Endless Difficulty Tiers (100% Solvable & 3-Star Guaranteed On the Fly)**:
   - **Easy**: `5×5` — Hearts only
   - **Medium**: `6×6` — Hearts + Rainbows
   - **Hard**: `7×7` — Hearts + Rainbows + Hidden
   - **Extreme**: `8×8` — All pearl types (Hearts + Rainbows + Hidden + Locked)

---

## 11. Pearl Loom v2.10 Design Delta — Final-Color Victory Rush & Optimal Solver Hints (`Status: Locked`)

Elevating end-of-puzzle momentum and making Hints genuinely trustworthy on hard boards:

1. **Final-Color Victory Rush Mode (`finalColorMode`)**:
   - Automatically engages when strictly **1 hoop color remains** (`remainingColors == 1 && Phase == Playing`) — the win is effectively in hand, so the game shifts into a snappy, effortless victory lap:
   - **Upbeat Rush Music**: Shifts [`ProceduralSoundscape`](file:///home/antigravity/patrickdomnick/mobile-game/src/audio/soundscape.ts) from calm atelier droplets into a bright, rhythmic Lydian victory-stretch arpeggio groove (auto-reverting on completion, reset, undo back to 2+ colors, or Start Menu).
   - **Zero Jiggles & Zero Gem Highlights**: Immediately clears and suppresses all `ColorGlowT` gem highlights, load/unlock wiggles, and periodic active/rainbow wiggles — only 1 color is left, so the board stays calm and crystal-clear.
   - **Snappier Motion & UI**: Nearly 2× faster pearl flight (`0.16s`), tighter tray cascade stagger (`0.03s`), faster hoop bloom (`9.5/s`), faster rolling score ticker, snappier floating callouts, and `FINISH` HUD caption.
   - **Zero-Error Auto-Resolve Tap Queue**: Tapping any blocked or locked gem in Final-Color Mode produces **zero error** (no red blocker flash, no error buzz, no error shake) and instead **queues** the gem (`AutoQueue`, confirmed with a crisp queue tick chime & subtle queued tile border). The moment its path/locks clear, queued gems automatically cascade into the hoop in rapid domino rhythm (`~55ms` beat).
2. **Mathematically Optimal, Never-Sabotaging Hints (`solveOptimalHint`)**:
   - Replaces first-found unrestricted DFS + unverified heuristic fallback with **Iterative-Deepening Minimum-Tray-Cost Search** (`extraTrayUses = 0, 1, 2, ..., 6` + unrestricted fallback).
   - Evaluates all playable root moves at the **minimum winning tray-cost tier** and picks the strictly best path to victory (lowest resulting tray fill, maximum newly unlocked direct stitches, earliest queued color, never dropping a dead/finished surplus color unless forced, early Heart & Locked-neighbor priority).
   - Never falls back to an unverified move that can sabotage the player into a Tray Full dead-end; if no winning path exists from the current board, cleanly prompts `Undo` (`HintNeedsUndo = -2`).

---

## 12. Pearl Loom v3.0 Design Delta — Out-of-Game Experience, Animated Unravel Onboarding & Custom Mode (`Status: Locked`)

Polishing first impressions, menu hierarchy, visual browseability, and sandbox play:

1. **First-Load 3D Unravel Intro & Guided Level 1 Tutorial**:
   - Fresh players (no prior campaign progress and `onboardingCompleted !== true`) launch straight into an **in-game 3D intro animation**: the **Pearl Loom** title appears while Jewel Atelier Level 1 (`Sunbeam Brooch`) starts **fully embroidered on the hoop**, then smoothly unravels its 14 pearls off the hoop and down onto the board tiles (`StartIntroUnravel()`).
   - Inside Tutorial Level 1, concise, non-blocking floating coach tooltips (`#tutorial-tooltip`) teach:
     - Active colors at top-left & tapping matching pearls on the board.
     - Arrow slide direction & the 5-slot holding tray.
     - Undo, Hint, and Restart controls.
   - Upon finishing Tutorial Level 1, the completion modal includes a clear **How Scoring & Stars Work** debrief (streak multiplier, clean stitch / 3-star rating, early Heart bonuses) with **Continue** (to Level 2) or **Start Menu** buttons.
   - Returning players skip straight to the Start Menu and can replay the intro/tutorial anytime from Settings.
2. **First-Encounter Special Pearl Tooltips & Spacious Settings Guide**:
   - The first time a player encounters each special pearl (`♥ Heart`, `🌈 Rainbow`, `? Hidden`, `🔒 Locked`) on a live board (`seenSpecials` persisted in `localStorage`), a compact, non-intrusive floating tooltip explains only the essential rule and dismisses cleanly on tap or `Got it`.
   - In the Settings drawer, each of the 4 special pearls gets its own spacious individual card/row with icon badge, title, and concise copy instead of one crammed paragraph.
3. **Redesigned 4-Row Start Menu**:
   - Removes the 4-campaign switcher strip from the Start Menu.
   - **Row 1 (Full-Width Primary CTA)**: Next Campaign Level hero button.
   - **Row 2 (2 Columns — Daily)**: Left = Today's **Daily Stitch**; Right = **Daily Library** (completed dailies archive with miniature embroidery previews & 1-tap replay).
   - **Row 3 (2 Columns — Random & Custom)**: Left = **Random** (dedicated studio screen — no instant-start); Right = **Custom** (new full puzzle builder).
   - **Row 4 (Bottom / Last Button)**: **Level Select** (opens Campaigns & Level Select).
4. **Theme-Synced 1-Column Square Level Select (`#overlay-gallery`)**:
   - Switching campaign tabs (`Jewel / Neon / Pop / Prism`) styles both the sheet (`data-view-theme`) and live 3D WebGPU background to match that world.
   - Displays **1-column square cards** featuring a crisp Retina **miniature SVG preview of the finished embroidery** (`src/preview.ts`), grid dimensions, level name, difficulty tier, colors, special badges, stars/best score, and frosted lock treatment for locked levels.
   - Removes Endless and Seed controls completely from Level Select.
5. **Dedicated Daily Library (`#overlay-daily-library`) & Random Studio (`#overlay-random`)**:
   - **Daily Library**: 1-column square archive of all completed Daily Stitches (miniature embroidery preview, date, style, stars, score, 1-tap Replay).
   - **Random Studio**: Top controls with **Seed input at the very top**, **Style selector** (`Random` or explicit `Jewel / Neon / Pop / Prism`), **Difficulty selector** (`Easy 5×5` → `Extreme 8×8`), and **Start** button; scrollable 1-column archive of all completed Random levels below.
6. **New Custom Mode Builder & Completed Archive (`#overlay-custom`)**:
   - Configure **Board Size** (`5×5` to `8×8`, independent cols & rows), **Color Count** (`3`–`6`), **Special Pearl Toggles** (`♥`, `🌈`, `?`, `🔒`), and **Style** (`Jewel / Neon / Pop / Prism`).
   - Generated on the fly in TinyGo WASM (`GenerateCustomArtwork` / `LoadCustomGenerated`) with guaranteed solvability and verified 3-star paths.
   - Scrollable **Completed Custom Patterns** 1-column square archive below the builder saving miniature embroidery previews, board rules, stars, best score, and 1-tap Replay.

---

## 13. Iteration Log

| Date | Milestone | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slices 0–4 (v1.0) | **Shipped & Playtested** | Real-device playtest revealed: pastel washout, unblocked tile spoilers, boards too small/easy (`3×3`/`4×4`), meaningless move counter, low reward juice, invisible day/night override, and missing Start Menu. |
| 2026-11-24 | **Pearl Loom v2.0 Overhaul** | **Shipped & Playtested** | Full redesign: `uint64` 5×5–7×7 boards, zero-spoiler tiles + blocker pulse, Balatro/VS juice, linear-space PBR across 5 themes, 24h solar override, Start Menu + Settings, plus automated fail-fast ABI/contrast guards & port `5173` WASM hot-reload. |
| 2026-11-24 | **Pearl Loom v2.1 — Chapters, Smart Hints & Active-Target Glow** | **Shipped & Playtested** | 40 patterns across 5 native Chapters, Daily/Endless theme rotation, pinch-rescue Hint (`-2` Undo beacon) + Hint/Undo score deductions, active-target glow. Playtest revealed: Noir mode was unenjoyable, permanent outer pearl glow looked cheap & hurt battery, binary ray-sphere/SDF edges looked jagged, and the final two colors were too easy when unlocked together. |
| 2026-11-25 | **Pearl Loom v2.2 — Retina AA, Solo Finale, Interior Glow & 0-FPS Idle** | **Shipped & Playtested** | Cut Noir (4 vivid Chapters × 8 = 32 designs); interior-only temporary pearl glow; solo finale unlock; analytic 1-spp AA at 2.0x DPR; true 0-FPS idle. Playtest revealed: initial glow too short/subtle vs always-bright pearls, Neon pearls still looked flat/out-of-place, Pop Art pearls had white center dots, some puzzles lacked verified 3-star paths, and Endless/Daily needed richer procedural seed variety + custom seed input. |
| 2026-11-25 | **Pearl Loom v2.3 — Spotlight Antipattern, Material Polish, Guaranteed 3-Star & Seed Input** | **Shipped & Playtested** | Sleek 3D Neon orbs & dot-free Pop Art cel pearls; tray-budgeted solver proving 3-star achievability on 100% of puzzles; 5-archetype procedural seed generator + custom seed input. Playtest revealed: darkening non-target pearls felt reversed/off, completion result screen lagged ~2s waiting for `CelebrateT`, and `navigator.vibrate` is ignored on iOS Safari. |
| 2026-11-25 | **Pearl Loom v2.4 — Pure Additive Interior Pulse, Instant Completion & iOS Safari Taptics** | **Shipped & Playtested** | Default zero glow / zero dimming; pure 3.5s double-beat chromatic interior glow strictly on starting & newly unlocked colors; instant `~0.35s` completion modal as final pearl lands; native iOS Safari `<input switch>` Taptic Engine clicks. Playtest requested: playful pearl-only wiggles on load/unlock + periodic ~1.2s random active-color pearl wiggle, plus closer 1-to-1 color matching between top-left HUD swatches and 3D board pearls. |
| 2026-11-25 | **Pearl Loom v2.5 — Playful Active-Pearl Wiggles & 1-to-1 Color-Matched Swatches** | **Shipped & Playtested** | Pearl-only 3D wiggle + hop on level load & color unlock + periodic random active-color wiggle (~1.25s, zero-spoiler, 0-FPS between wiggles); sharper 6-color hue separation across all 4 themes + ACES-matched miniature 3D HUD pearl swatches (`pearl-loom-v9`). Playtest revealed: iOS 26.5 blocked programmatic switch `.click()` haptics, Safari audio needed `audioSession='playback'` + `'interrupted'`/frozen-clock self-healing, wiggles fired too immediately/frequently, and iOS 26 Safari hides *Add to Home Screen* behind `•••` → Share. |
| 2026-11-25 | **Pearl Loom v2.6 — iOS 26.5 Direct-Tap Haptics, Bulletproof Audio, Delayed Wiggles & Install Guide** | **Shipped & Playtested** | Direct-tap transparent switch/label overlay haptics + Settings Test Haptic; `audioSession='playback'` + interrupted/frozen-clock self-healing audio; `+0.70s`/`+0.85s` delayed calm wiggles + `3.0s` quiet-hand ambient cadence; in-app iOS 26 Safari PWA Install Guide (`pearl-loom-v10`). Playtest revealed: standalone PWA had a bottom black chin (`100dvh` WebKit quirk), Start Menu had duplicate Time & unnecessary Install buttons, UI copy felt too technical; requested Heart Pearls (max 3/level with early-placement bonus & chime), remote-cached `levels.json`, and a 200-level 4-campaign roadmap plan. |
| 2026-11-25 | **Pearl Loom v2.7 — Full-Screen Standalone Fix, Cozy UI, Heart Pearls & Remote Cached `levels.json`** | **Shipped & Playtested** | Edge-to-edge standalone PWA height fix (confirmed working on iPhone!); clean non-technical UI without redundant Time/Install buttons; 1–3 Bonus Heart Pearls with contrast-adaptive ♥ inlay, early-placement score scaling, periodic wiggle & crystalline chime; remote-fetched + offline-cached `public/levels.json` loaded dynamically into WASM (`pearl-loom-v11`). |
| 2026-11-25 | **Pearl Loom v2.8 — 4-Campaign Testrun (52 Levels, `8×8` Support, Monotonic Difficulty & Level Locking)** | **Shipped & Playtested** | Upgraded engine & WebGPU shader to 64 tiles (`8×8`, `1248` floats, static BSS solver buffers); 4 Day-1 campaigns × 13 levels (`5×5` zero-blocker warmups → `8×8` 64-pearl masterpieces) with monotonic difficulty; sequential per-campaign level locking; cleaned Campaign-first Start Menu & Campaigns Map (`pearl-loom-v12`). Confirmed `8×8` is ideal upper bound on iPhone 16 and ramp feels great! |
| 2026-11-25 | **Pearl Loom v2.9 — Special Pearls Suite (3D Heart, Rainbow, Hidden, Locked), Live `config.json` & Seeded Difficulties** | **Shipped & Verified** | True 3D raymarched heart pearl; Rainbow wild pearls (surplus pearl + independent jiggle + shimmer arp); Obsidian Hidden pearls (reveal when stitchable + chime); 4-neighbor Locked pearls (directional clasp overlay + latch-release audio); remote-cached `public/config.json`; 4 seeded difficulty tiers (`Easy 5×5` → `Extreme 8×8`) (`pearl-loom-v13`). |
| 2026-11-25 | **Pearl Loom v2.10 — Final-Color Victory Rush, Auto-Resolve Queue & Optimal Solver Hints** | **Shipped & Verified** | Final-color rush mode: upbeat victory music, snappier flight/UI, zero jiggles & zero gem highlights, zero-error click-to-queue auto-resolve domino cascade; iterative-deepening minimum-tray-cost optimal Hint solver that always picks the best winning path (`pearl-loom-v14`). |
| 2026-11-25 | **Pearl Loom v3.0 — Animated Unravel Onboarding, Refined Menus, Miniature Embroidery Previews & Custom Mode** | **Shipped & Verified** | Live 3D hoop-to-board unravel intro + guided Level 1 tooltips & post-level scoring debrief; first-encounter Special Pearl tooltips + spacious per-pearl Settings guide; 4-row Start Menu; theme-synced 1-column square Level Select with Retina SVG embroidery previews; Daily Library archive; Random Studio (seed/style/difficulty + completed archive); Custom Mode builder (`5×5`–`8×8`, `3–6` colors, special toggles, style) (`pearl-loom-v15`). |


