# Spec 01 — Game Vision & Mechanics: **Pearl Loom** (Living Spec)

- **Title**: **Pearl Loom**
- **Status**: `Locked` (Core Vision) · `Prototyping` (Vertical Slices)
- **Last Updated**: 2026-11-24

> **Pearl Loom** is a relaxing, zero-timer, zero-stress tactile craft puzzle designed for iPhone 16 — blending the satisfying directional untangling of *Arrow Jam*, the calm deductive planning of *Sudoku*, and the luminous beauty of *Pearl Embroidery*, rendered in real time with **WebGPU raytracing** and **TinyGo WebAssembly**.

---

## 1. Core Experience & Design Pillars (`Status: Locked`)

1. **Zero Stress, Zero Timers, Zero Ads**:
   - Never real-time or time-critical. Playable with one thumb at your own pace over morning coffee or winding down in bed.
   - No harsh red error flashes, no buzzers, no punishing "Game Over" screens.
2. **Tactile Raytraced Craftsmanship**:
   - Every pearl is a physically shaded, real-time raytraced glossy/iridescent bead with specular highlights, soft cast shadows, and subtle reflections on a warm woven linen & champagne-brass embroidery atelier.
3. **Living Real-World Time of Day (Continuous Solar & Acoustic Flow)**:
   - **Lighting**: No manual Day/Night toggle and no stepped theme jumps. The WebGPU raytracer reads the real-world local clock (`hour ∈ [0.0, 24.0)` continuously) and imperceptibly glides sun direction, shadow elongation, light warmth, linen tint, and candle/moonlight balance across the entire 24-hour cycle:
     - **Dawn (~05:30–08:30)**: soft blush rose-gold low morning sun, long gentle shadows.
     - **Midday (~09:30–15:30)**: airy sunlit cream-linen atelier, high soft window light, vivid pastel luster.
     - **Golden Hour (~16:30–19:30)**: warm honey-amber raking sun, rich golden reflections on the brass hoop and pearls.
     - **Evening & Night (~20:00–05:00)**: serene moonlit silver-indigo ambient fill balanced with a warm bedside candle/lamp glow so the pearls shimmer gently without bright white eye strain.
   - **Procedural Generative Audio (Zero `.mp3`/`.wav` assets)**:
     - 100% synthesized in real time using the **Web Audio API** (offline-capable, tiny footprint).
     - Harmonic scale, chord density, filter warmth, and tempo drift continuously with the real-world clock (airy morning kalimba/harp → warm afternoon Rhodes/marimba → amber golden-hour pads → soft felt-piano / music-box lullaby at night).
     - Tactile procedural foley: delicate porcelain/pearl clinks, soft wooden tap on blocked pieces, and gentle silk-stitch chimes tuned harmoniously to the active chord. Includes a quiet 1-tap audio mute toggle.

---

## 2. Core Gameplay Loop (`Status: Locked`)

### Single-Screen Portrait Layout (`393×852` iPhone 16)
1. **Top (~38%) — The Embroidery Hoop**:
   - A raytraced champagne-brass embroidery hoop stretching fine linen fabric with delicate stitch guide dots forming the current pearl artwork.
   - Displays **2–3 active stitch color requests** (the pearl colors currently being embroidered onto the hoop).
   - As each matching pearl arrives, it smoothly arcs onto its exact stitch point on the hoop with a soft pearlescent shimmer.
2. **Middle (~10%) — The 5-Slot Silk Holding Tray**:
   - Five recessed porcelain/silk pearl dimples.
   - Freed pearls whose color is *not* currently requested rest calmly here.
   - The instant a matching stitch color becomes active on the hoop, any waiting pearls of that color automatically glide up and stitch themselves onto the artwork!
3. **Bottom (~46%) — The Pearl Untangle Board**:
   - A clean grid holding directional pearl tiles / short pearl arrows (pointing `Up`, `Down`, `Left`, or `Right`), each colored to match pearls needed by the embroidery pattern.
   - **Tap Rule**:
     - If the ray in the tile's arrow direction is clear to the board edge, tapping it smoothly glides the tile off the board and releases its pearl(s) into either the **Embroidery Hoop** (if color matches an active stitch) or the **Silk Holding Tray** (otherwise).
     - If blocked by another tile, tapping gives a gentle, soft tactile wobble + quiet wooden tap sound (no penalty).
4. **Zero-Stress Comfort Helpers**:
   - **Unlimited 1-Tap Undo**: cleanly rewinds the last move(s) without friction.
   - **Calm Visual Hint**: softly pulses a subtle golden halo around a mathematically safe unblocked tile (computed deterministically by TinyGo WASM).
   - **Tray-Full Recovery**: if all 5 silk slots fill with no auto-stitchable pearl, a calm gentle banner offers **Undo** or **Restart Pattern** — never a punishing "Game Over".

---

## 3. Artworks, Puzzle Generation & Gallery (`Status: Locked`)

- **Hybrid Artwork System**:
  1. **Curated Handcrafted Motifs**: charming recognizable pearl artworks (e.g., *Sakura Blossom*, *Crescent Moon*, *Butterfly*, *Cozy Cat*, *Wildflower*, *Seashell*, *Clover*, *Heart*) progressing gently in size and color richness.
  2. **Endless Procedural Symmetrical Mandalas**: once past curated patterns (or selectable anytime, plus a calendar-seeded **Daily Stitch**), TinyGo WASM procedurally generates balanced 4-fold / 6-fold / 8-fold radial pearl mandalas so there is never a hard end.
- **Guaranteed-Solvable TinyGo Generator**:
  - Untangle boards are constructed deterministically in `sim/` (reverse-peeling / DAG solvability verification) so every single puzzle is **100% mathematically solvable** without guessing or dead-end traps.
- **Local Embroidery Gallery**:
  - Completed pearl artworks are saved locally (`localStorage`) so the player can revisit and admire her finished shimmering collection anytime, lit by the current real-world sun/moonlight.

---

## 4. Vertical Slice Roadmap (`Status: Prototyping`)

| Slice | Goal | Acceptance Checks |
| :--- | :--- | :--- |
| **Slice 0** *(Done)* | Proof-of-pipeline: TinyGo WASM + WebGPU raytracer + Safari PWA + GitHub Pages HTTPS + autonomous Playwright E2E | `42 KB` WASM, 0 WebGPU errors, live HTTPS PWA verified. |
| **Slice 1** *(Next)* | **Pearl Loom Core Playable Puzzle + Continuous Solar Raytracing**: Real-world 24h sunlit/moonlit linen atelier shader, Top Embroidery Hoop + 5-slot Silk Tray + Bottom Directional Pearl Untangle Grid, 3 curated starter artworks (*Heart*, *Blossom*, *Crescent Moon*), unlimited Undo, gentle Hint, guaranteed-solvable TinyGo generator, and autonomous AI solver playtest (`timeOfDayOverride` visual checks for Morning, Golden Hour, Night). | TinyGo unit tests prove 100% solvability + undo fidelity; Playwright AI autonomously solves a full embroidery artwork to 100% completion across solar lighting states with 0 errors. |
| **Slice 2** | **Procedural Time-of-Day Web Audio & Tactile Polish**: Zero-asset generative Web Audio soundtrack adapting continuously to real-world hour, harmonious synthesized pearl clinks & stitch chimes, subtle mute pill, smooth pearl-flight arcs & embroidery completion shimmer celebration. | Zero audio errors in headless Chromium; clean mute toggle; smooth flight interpolation verified visually. |
| **Slice 3** | **Curated Collection + Endless Procedural Mandalas + Local Embroidery Gallery**: Expand curated motifs (8+), add TinyGo procedural symmetrical mandala generator + Daily Stitch, and add a calm single-screen Gallery drawer to view completed raytraced artworks. | Persistence verified across reloads in E2E; procedural generator passes 100-seed solvability fuzz test in `go test`. |
| **Slice 4** | **iPhone 16 Real-Device Polish & Release**: Dynamic resolution tuning for 60 FPS thermal comfort on A18, final app icon & splash polish, release push to `origin/main` → live HTTPS GitHub Pages PWA. | Verified on real iPhone 16 Safari standalone PWA. |

---

## 5. Iteration Log

| Date | Slice / Experiment | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | Slice 0 — Hello Raytracer | **Verified (Pass)** | `42 KB` TinyGo WASM (`wasip1 c-shared`), 3-bounce WebGPU WGSL raytracer, 0 validation errors, live HTTPS GitHub Pages deployed & verified. |
| 2026-11-24 | Design Interview (`/grill-me`) | **Locked Core Vision** | Defined **Pearl Loom**: relaxing Arrow-Jam untangle + 5-slot silk tray + Pearl Embroidery hoop, continuous 24h real-world solar raytracing, zero-asset procedural time-of-day Web Audio, curated motifs + endless procedural mandalas, unlimited gentle Undo + Hint. |
| 2026-11-24 | Slice 1 — Core Puzzle & 24h Solar Raytracer | **Verified (Pass)** | `89 KB` WASM (`12.6 KB` gzip JS), 5/5 Go suites incl. 50-seed 5-slot-tray solvability fuzzer, WebGPU raytracer w/ spatial early-out & continuous solar+candle lighting (verified visually at Noon, Golden Hour, Night), full real-tap autonomous solve of *Rose Heart*, Hint/Undo/Blocked wobble, and idle battery throttle verified in `39.3s`. |
| 2026-11-24 | Slice 2 — Procedural 24h Audio & Tactile Polish | **Verified (Pass)** | Zero-asset Web Audio API generative soundscape (`src/audio/soundscape.ts`) continuously morphing scale/filter/cadence with real-world solar time + harmonious pearl stitch chimes, tray taps, wood knock & completion arpeggio; persisted Mute pill; `✦ DONE` badge; fixed top-bar wrapping on `393px` width. |
| 2026-11-24 | Slice 3 — 8 Curated Motifs, Mandalas, Daily & Gallery | **Verified (Pass)** | Expanded to 8 Kishōtenketsu motifs (9–24 pearls, 3×3→5×5) + procedural 4/5/6/8-fold Mandala generator (100/100 fuzz solvable in `0.06s`) + calendar-seeded Daily Stitch + frosted-glass Atelier Gallery with `localStorage` persistence verified across reload (`97 KB` WASM, `15.9 KB` gzip JS). |
