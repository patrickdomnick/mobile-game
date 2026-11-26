# Spec 03 — 200-Level Four-Campaign Sawtooth Progression & Content Architecture (`Status: Locked`)

> **Intent**: Architectural specification for Pearl Loom's full **4 independent × 50-level campaigns (`200` levels total)** delivered via compact remote-cached `public/levels.json` (`version: 4`), featuring a **Sawtooth Wave progression** across every board size (`5×5` → `8×8`) and **sculpted 3-color fun-shape breather boards** on every square `.1` tier entry (`6×6`, `7×7`, `8×8`).

---

## 1. Four Independent Campaigns (`4 × 50 = 200` Levels)

All 4 themed worlds are unlocked from Day 1 with independent progress (`0/50`), stars (`0/150`), and frontier pointer:

| Campaign ID | Campaign Name | Visual Style | Signature Mood & Pattern Language | Levels |
| :--- | :--- | :--- | :--- | :--- |
| `0` | **Jewel Atelier** | Theme 0 (Gemstones on slate-walnut) | Brooches, blossoms, crowns, hearts, butterflies, eternal loops | `1–50` |
| `1` | **Cyber Arcade** | Theme 1 (Electric neon synthwave) | Digits (`6`, `7`, `8`), pixel sprites, laser grids, circuit cores, portals | `1–50` |
| `2` | **Pop Studio** | Theme 2 (Bold Warhol primaries & comic ink) | Smileys, monograms (`P`, `HI`), comic bolts, starbursts, pop gems | `1–50` |
| `3` | **Cathedral Glass** | Theme 3 (Glowing stained-glass prisms) | Crosses, chalices, gothic arches, seraph wings, grand rose windows | `1–50` |

---

## 2. Sawtooth Wave Progression Rules (`Status: Locked`)

Each campaign consists of **10 escalating 5-level tiers** (`10 × 5 = 50` levels):
`5×5` → `6×5` → `6×6` → `7×6` → `7×7` → `8×6` → `8×7` → `8×8 Standard` → `8×8 Expert` → `8×8 Master`.

Every time a new board size tier begins (`.1` level):
1. **Color Reset**: Color count drops back down (`3` on `6×5.1` and all square `.1` fun levels; `4` on rectangular `7×6.1`, `8×6.1`, `8×7.1`), then climbs back up to the tier's full palette by `.5`.
2. **Special Pearl Reset (Option B)**: Keep friendly **Heart Pearls (`♥`)** on `.1` from `6×5` onward, while stripping tricky specials (`🌈`, `?`, `🔒`) back to `0` on `.1` and progressively re-layering them across `.2 → .5` as each special type unlocks across the campaign (`♥` at L03, `🌈` at L13, `?` at L24, `🔒` at L35).
3. **Logic Difficulty Reset**: `Difficulty` dips sharply on `.1` (sawtooth wave) and ramps `+1` per level to a mini-boss peak at `.5`, culminating at **Level 50 (`8×8 Master .5`)** with **all 6 colors, all 4 special pearls (`♥×3, 🌈×2, ?×4, 🔒×3`), 64/64 board tiles (`62` hoop stitches + `2` Rainbows), and maximum `Difficulty = 11`**.
4. **Square `.1` Fun Breather Boards**: Every square `.1` level (`6×6` L11, `7×7` L21, `8×8` L36, `8×8` L41, `8×8` L46) is a joyful low-stress palette cleanser: **only 3 colors**, **breezy low difficulty (`1–3`)**, `♥` Hearts only, and a **custom sculpted pixel-art board shape** (letters, numbers, hearts, smileys, diamonds, crowns, lightning bolts, pixel sprites, wings, infinity loops, cathedral arches) transmitted via `boardShape` in `levels.json` and `CustomLevelBuf[13]` (zero ABI expansion).

---

## 3. Complete 10-Tier × 5-Level Matrix (Per Theme)

| Tier | Levels | Grid | `.1` Breather Reset | `.5` Tier Capstone | Specials Unlocked |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **T1** | `01–05` | `5×5` | L01–02: `3c`, Diff `0` (**Zero Blockers**), `0` specials | L05: `23` pearls, `4c`, Diff `3`, `♥×2` | `♥` (at L03) |
| **T2** | `06–10` | `6×5` | L06: `20` pearls, `3c ↓`, Diff `1 ↓`, `♥×1` | L10: `28` pearls, `5c`, Diff `5`, `♥×2` | `♥` |
| **T3** | `11–15` | `6×6` | L11: **Fun Shape** (`♥`/`6`/`☺`/`✝`), `3c ↓`, Diff `1 ↓`, `♥×2` | L15: `34` pearls, `5c`, Diff `5`, `♥×2 🌈×1` | `♥ 🌈` (🌈 at L13) |
| **T4** | `16–20` | `7×6` | L16: `28` pearls, `4c ↓`, Diff `2 ↓`, `♥×2` | L20: `40` pearls, `6c`, Diff `6`, `♥×2 🌈×1` | `♥ 🌈` |
| **T5** | `21–25` | `7×7` | L21: **Fun Shape** (`♦`/`7`/`P`/`⚱`), `3c ↓`, Diff `2 ↓`, `♥×2` | L25: `47` pearls, `6c`, Diff `6`, `♥×2 🌈×1 ?×3` | `♥ 🌈 ?` (? at L24) |
| **T6** | `26–30` | `8×6` | L26: `34` pearls, `4c ↓`, Diff `3 ↓`, `♥×2` | L30: `46` pearls, `6c`, Diff `7`, `♥×3 🌈×1 ?×3` | `♥ 🌈 ?` |
| **T7** | `31–35` | `8×7` | L31: `40` pearls, `4c ↓`, Diff `4 ↓`, `♥×2` | L35: `54` pearls, `6c`, Diff `8`, `♥×3 🌈×1 ?×3 🔒×1` | `♥ 🌈 ? 🔒` (🔒 at L35) |
| **T8** | `36–40` | `8×8` Std | L36: **Fun Shape** (`♛`/`8`/`⚡`/`⛪`), `3c ↓`, Diff `2 ↓`, `♥×2` | L40: `58` pearls, `6c`, Diff `8`, `♥×3 🌈×2 ?×3 🔒×2` | All 4 |
| **T9** | `41–45` | `8×8` Exp | L41: **Fun Shape** (`🦋`/`👾`/`★`/`🪽`), `3c ↓`, Diff `3 ↓`, `♥×2` | L45: `60` pearls, `6c`, Diff `9`, `♥×3 🌈×2 ?×4 🔒×2` | All 4 |
| **T10** | `46–50` | `8×8` Mst | L46: **Fun Shape** (`∞`/`♥`/`HI`/`✦`), `3c ↓`, Diff `3 ↓`, `♥×3` | L50: **`62` (+2🌈=64), `6c`, Diff `11`, `♥×3 🌈×2 ?×4 🔒×3`** | **Full Mastery** |

---

## 4. Technical & Data Contracts (`Status: Locked`)

- **10-Archetype Hoop Pattern Library (`sim/artworks_shapes.go`)**: Petal Blossom, Faceted Starburst, Sculpted Heart, Golden Spiral, Diamond Lattice, Cathedral Quatrefoil, Sunburst Spokes, Butterfly Wings, Hex Honeycomb, and Grand Rose Window — with deterministic minimum-spacing relaxation guaranteeing zero overlapping pearls.
- **Sculpted Board Shapes (`BoardShape` `0..20`)**: Packed in `public/levels.json` (`"boardShape": N` when `> 0`) and `CustomLevelBuf[13]` (reusing the reserved header slot with zero ABI breakage).
- **Compact `public/levels.json` (`version: 4`)**: Exported minified via `cd sim && go run ./cmd/export-levels`, keeping all 200 levels compact for instant PWA caching.
- **Save Migration (`src/gallery.ts`)**: `catalogVersion: 4` cleanly resets old `v3` 52-level `completedCurated` IDs for the fresh 200-level ladder while preserving `onboardingCompleted`, `seenSpecials`, `settings`, and all `dailyHistory` / `randomHistory` / `customHistory` embroidery archives.
- **Level Select Tier Navigation (`src/ui/sheets.ts`)**: Sticky horizontal size-tier quick-jump pills (`5×5` … `8×8 Mst`), tier section headers grouping each 5-level sawtooth wave, automatic scroll to the active frontier card, and `content-visibility: auto` for butter-smooth 60 FPS iPhone 16 scrolling.
