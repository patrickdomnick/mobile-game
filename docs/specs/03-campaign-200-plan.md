# Spec 03 — 200-Level Four-Campaign Progression & Content Architecture (`Status: Planned — Do Not Build Yet`)

> **Intent**: Architectural blueprint for restructuring Pearl Loom's curated content into **4 independent, escalating 50-level campaigns (200 levels total)** delivered via remote-cached `public/levels.json`. Deliberately held in planning until core mechanics (Heart Pearls, future special pearls/modifiers, scoring balance) are finalized so we never have to re-author 200 levels.

---

## 1. Four Independent Campaigns (4 × 50 = 200 Levels)

Instead of a single linear 32-level sequence where players only see *Cyber Arcade* or *Cathedral Glass* after finishing earlier chapters, players choose **any of the 4 themed Campaigns** freely and progress independently through each world's 50-level mastery ladder:

| Campaign ID | Campaign Name | Visual Style | Signature Mood & Pattern Language | Levels |
| :--- | :--- | :--- | :--- | :--- |
| `0` | **Jewel Atelier** | Theme 0 (Gemstones on slate-walnut) | Brooches, blossoms, crowns, botanical mandalas, filigree crests | `1–50` |
| `1` | **Cyber Arcade** | Theme 1 (Electric neon synthwave) | Pulses, pixel sprites, laser grids, circuit cores, hyper-portals | `1–50` |
| `2` | **Pop Studio** | Theme 2 (Bold Warhol primaries & comic ink) | Stars, comic hearts, lightning bursts, retro suns, pop diamonds | `1–50` |
| `3` | **Cathedral Glass** | Theme 3 (Glowing stained-glass prisms) | Lanterns, chalices, gothic arches, angel wings, grand rose windows | `1–50` |

Each campaign tracks its own completion counter (`0/50`), total stars (`0/150`), and "Continue Campaign" pointer in `localStorage`.

---

## 2. Exact 50-Level Size & Difficulty Ladder (5×5 → 8×8)

Each campaign consists of **10 escalating 5-level tiers** (`10 × 5 = 50` levels). Within every 5-level block, difficulty ramps smoothly from level `.1` (comfortable) to `.5` (tier capstone).

### Proposed 10-Tier Size Matrix (`5×5` up to `8×8`)

| Tier | Levels | Grid Size | Max Pearls | Colors | Blocker / Interlock Rules | Heart Pearls |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Warm-Up)** | `1–2` | `5×5` | `18–22` | `3–4` | **ZERO blockers (`noBlockers: true`) — 100% direct outward placement!** Teaches colors, stitch queue & Heart timing friction-free. | `1–2` |
| **Tier 1 (Intro)** | `3–5` | `5×5` | `20–24` | `4` | Gentle 1-deep interlocks (`difficulty: 1`) | `1–2` |
| **Tier 2** | `6–10` | `6×5` | `24–28` | `4–5` | Light-to-medium interlocks (`difficulty: 1 → 2`) | `2` |
| **Tier 3** | `11–15` | `6×6` | `28–34` | `4–5` | Medium interlocks + inward chains (`difficulty: 2`) | `2` |
| **Tier 4** | `16–20` | `7×6` | `34–40` | `5` | Medium-hard interlocks, 2-step dependencies (`difficulty: 2 → 3`) | `2–3` |
| **Tier 5** | `21–25` | `7×7` | `40–47` | `5–6` | Tactical pockets & color-order planning (`difficulty: 3`) | `2–3` |
| **Tier 6** | `26–30` | `8×6` | `40–46` | `5–6` | Wide horizontal lanes & cross-blocking (`difficulty: 3`) | `2–3` |
| **Tier 7** | `31–35` | `8×7` | `46–54` | `6` | Deep interlocking corridors (`difficulty: 3 → 4`) | `3` |
| **Tier 8** | `36–40` | `8×8` (Standard) | `52–58` | `6` | Full `8×8` craft boards, balanced puzzle rhythm (`difficulty: 3 → 4`) | `3` |
| **Tier 9** | `41–45` | `8×8` (Expert) | `56–62` | `6` | Tight tray budget, deep multi-step untangles (`difficulty: 4`) | `3` |
| **Tier 10** | `46–50` | `8×8` (Master) | `58–64` | `6` | Grand signature masterpieces, peak strategic interlock (`difficulty: 4+`) | `3` |

> **Locked Grid Progression (Option A)**: `5×5` (Levels 1–2 zero blockers, 3–5 intro) → `6×5` → `6×6` → `7×6` → `7×7` → `8×6` → `8×7` → `8×8 Standard` → `8×8 Expert` → `8×8 Master` (10 tiers × 5 levels = **50 levels per campaign**, **200 levels total**).
>
> **Locked Campaign Access**: **All 4 tracks unlocked from Day 1** — players can freely jump into *Jewel Atelier*, *Cyber Arcade*, *Pop Studio*, or *Cathedral Glass* right away and progress each 50-level ladder independently.

---

## 3. Planned Special Pearl Mechanics (Prototype & Lock BEFORE Generating the 200 Levels)

Level generation remains **intentionally paused** until the full special-pearl suite is prototyped and playtested, so all 200 levels can be authored once with rich variety across tiers:

| Special Pearl | Status | Core Mechanic Concept | Planned Campaign Tier Introduction |
| :--- | :--- | :--- | :--- |
| **Heart Pearl (`♥`)** | **Shipped (v2.7)** | Up to 3 per level; placing early grants scaling bonus (`+600 → +150`), periodic wiggle + crystalline chime. | **Tier 1+** (Levels `1–50`) |
| **Mystery Pearl (`?`)** | **Planned** | Conceals its true color under a shimmering pearlescent/question shell until revealed (candidate reveal triggers to prototype: *when its lane becomes unblocked*, *when any neighbor clears*, or *when tapped into the tray*). | **Tier 2–3+** (`6×5` / `6×6`) |
| **Rainbow / Wild Pearl (`✦`)** | **Planned** | Iridescent prismatic pearl that matches **any currently active hoop color** when tapped — acts as a clutch combo extender or tray rescuer, with solver-aware 3-star balance. | **Tier 4–5+** (`7×6` / `7×7`) |
| **Locked Pearl (`🔒`)** | **Planned** | Wrapped in a delicate metallic clasp/seal that blocks movement until a trigger clears (candidate triggers to prototype: *a specific color layer finishes*, *N pearls are stitched*, or *a matching Key Pearl is placed*). | **Tier 6–7+** (`8×6` / `8×7`) |
| **Combined Mastery** | **Planned** | Mixes Heart + Mystery + Rainbow + Locked pearls into signature multi-layer puzzles on full `8×8` boards. | **Tier 8–10** (`8×8` Standard / Expert / Master) |

### Extensible JSON Schema Reservation (`public/levels.json`)
Before generating the 200 levels, each level entry in `public/levels.json` can cleanly support per-level mechanic budgets or explicit per-tile modifiers without breaking older clients:
- Level-level budgets/rules: `maxHearts`, `mysteryCount`, `rainbowCount`, `lockedRules` (e.g., `[{ "tile": 14, "unlockOn": "colorClear", "arg": 0 }]` or `unlockCount`).
- Per-tile optional modifier bitmask (`modFlags`) & `modArg` packed into the WASM staging buffer alongside `(x, y, color, ring)`.
- **Zero-Spoiler Rule Preserved**: Mystery, Rainbow, and Locked visual tells show only the pearl's special identity (never whether its arrow lane is currently blocked or free).

---

## 4. Technical Upgrades Required When Ready to Build `8×8`

Because Pearl Loom v2.7 already ships the remote-cached `public/levels.json` pipeline and `noBlockers` flag, enabling the full 200-level `8×8` campaign later requires only one clean ABI upgrade:

1. **Expand `MaxGridTiles` & `MaxHoopPearls` from `49` (`7×7`) → `64` (`8×8`)**:
   - **Zero bitmask rewrite**: `sim/solver.go` already uses `uint64` (`aliveMask`, `claimedMask`), which natively holds **exact 64 tiles (`0..63`)**!
   - Update `SceneFloats` in lockstep across `sim/engine.go`, `src/main.ts` (`SCENE_BUFFER_BYTES`), and `src/renderer/raytrace.wgsl` (`array<PearlNode, 64>`):
     - `64 (header) + 24 (palette) + (64 + 64 + 5 + 12) * 8 = 1248 floats` (`4,992 bytes`).
   - `pnpm check:contracts` automatically enforces exact 1248-float parity across Go, TypeScript, and WGSL.
   - Update `CustomLevelBuf` staging buffer size from `256` → `340+` floats (room for 64 stitches + per-tile special pearl metadata).
   - Tune `BoardMaxSpan` / `CellPitch` for `8×8` (`3.16 / 8 = 0.395` world units) and verify comfortable iPhone 16 touch target accuracy (`~42px` per tile on `393px` portrait width — right at Apple HIG comfort!).

2. **Zero-Blocker Mode (`noBlockers: true`) for Levels 1–2 of Each Campaign**:
   - Already wired into the `public/levels.json` schema (`flags |= 1` in `sim/engine.go`).
   - When `noBlockers: true`, every tile's exit arrow points cleanly outward along an unobstructed lane, guaranteeing **100% direct placement from tap 1** for a relaxing, instant-win onboarding in every style!

3. **Offline Authoring & 3-Star Verification Tool (`cmd/gen-levels`)**:
   - A small Go CLI that reads campaign design templates, generates/validates all 200 levels with `solveWithTrayBudget` (aware of Mystery, Rainbow, and Locked pearl rules — proving **100% solvability & 3-star achievability** on every single level, zero blockers on levels `1–2` of each campaign, exact Option A size progression, and unique names/patterns), and outputs a single minified `public/levels.json` (`~60–110 KB` raw, `~18 KB` gzipped!).
   - Once the app supports `64` tiles + the finalized special pearls, future campaigns or seasonal packs can be pushed by editing `public/levels.json` alone — zero app rebuild!

---

## 5. Locked Decisions Summary

| Topic | Decision |
| :--- | :--- |
| **10-Tier Size Ladder (50 levels / campaign)** | **Option A**: `5×5` (1–2 zero blockers, 3–5 intro), `6×5`, `6×6`, `7×6`, `7×7`, `8×6`, `8×7`, `8×8 Standard`, `8×8 Expert`, `8×8 Master`. |
| **Campaign Access** | **All 4 campaigns unlocked from Day 1** with independent per-campaign progress & stars. |
| **Special Pearls Sequencing** | Prototype & finalize **Mystery Pearls**, **Rainbow Wild Pearls**, and **Locked Pearls** (alongside shipped **Heart Pearls**) *before* generating the 200-level catalog. |
