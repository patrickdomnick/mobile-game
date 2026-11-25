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

> **Alternative Note for Review**: The strict monotonic rectangular ladder `5×5 → 6×5 → 6×6 → 7×6 → 7×7 → 8×7 → 8×8` has **7 distinct sizes** (`7 × 5 = 35` levels). To hit **50 levels per campaign**, the matrix above adds `8×6` (5 levels) and divides `8×8` into 3 escalating mastery tiers (Standard / Expert / Master = 15 levels). Alternative options before generation:
> - **Option A (Recommended above)**: 7 sizes + `8×6` + 3 `8×8` mastery bands = 50 levels.
> - **Option B (Landscape/Portrait pair sizes)**: `5×5`, `5×6`, `6×5`, `6×6`, `6×7`, `7×6`, `7×7`, `7×8`, `8×7`, `8×8` (literally 10 distinct grids × 5 levels = 50 levels!).

---

## 3. Technical Upgrades Required When Ready to Build `8×8`

Because Pearl Loom v2.7 already ships the remote-cached `public/levels.json` pipeline and `noBlockers` flag, enabling the full 200-level `8×8` campaign later requires only one clean ABI upgrade:

1. **Expand `MaxGridTiles` & `MaxHoopPearls` from `49` (`7×7`) → `64` (`8×8`)**:
   - **Zero bitmask rewrite**: `sim/solver.go` already uses `uint64` (`aliveMask`, `claimedMask`), which natively holds **exact 64 tiles (`0..63`)**!
   - Update `SceneFloats` in lockstep across `sim/engine.go`, `src/main.ts` (`SCENE_BUFFER_BYTES`), and `src/renderer/raytrace.wgsl` (`array<PearlNode, 64>`):
     - `64 (header) + 24 (palette) + (64 + 64 + 5 + 12) * 8 = 1248 floats` (`4,992 bytes`).
   - `pnpm check:contracts` automatically enforces exact 1248-float parity across Go, TypeScript, and WGSL.
   - Update `CustomLevelBuf` staging buffer size from `256` → `300` floats (`10 + 64 * 4 = 266` floats).
   - Tune `BoardMaxSpan` / `CellPitch` for `8×8` (`3.16 / 8 = 0.395` world units) and verify comfortable iPhone 16 touch target accuracy (`~42px` per tile on `393px` portrait width — right at Apple HIG comfort!).

2. **Zero-Blocker Mode (`noBlockers: true`) for Levels 1–2 of Each Campaign**:
   - Already wired into the `public/levels.json` schema (`flags |= 1` in `sim/engine.go`).
   - When `noBlockers: true`, every tile's exit arrow points cleanly outward along an unobstructed lane (or is verified to have 0 blockers in its starting configuration), guaranteeing **100% direct placement from tap 1** for a relaxing, instant-win onboarding in every style!

3. **Offline Authoring & 3-Star Verification Tool (`cmd/gen-levels`)**:
   - A small Go CLI that reads campaign design templates, generates/validates all 200 levels with `solveWithTrayBudget` (proving **100% 3-star achievability** on every single level, zero blockers on levels `1–2` of each campaign, exact size progression, and unique names/patterns), and outputs a single minified `public/levels.json` (`~60–90 KB` raw, `~15 KB` gzipped!).
   - Once the app supports `64` tiles, future campaigns or seasonal packs can be pushed by editing `public/levels.json` alone — zero app rebuild!

---

## 4. Open Design Decisions to Confirm Before Building the 200 Levels

1. **10-Tier Grid Choice**: Prefer **Option A** (adding `8×6` + 3 escalating `8×8` mastery bands) or **Option B** (all 10 rectangular pairs `5×5, 5×6, 6×5, 6×6, 6×7, 7×6, 7×7, 7×8, 8×7, 8×8`)?
2. **Campaign Unlocking**: Should all 4 campaigns be **unlocked from day 1** (play any style anytime), or unlock sequentially after beating e.g. 5 levels in the previous campaign?
3. **Future Special Pearls**: Before locking all 200 JSON levels, do we want to reserve JSON hooks for any other special pearls alongside **Heart Pearls** (e.g., *Locked/Ice Pearls*, *Rainbow Wild Pearls*, *Chain Pearls*)?
