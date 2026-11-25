# Spec 02 — Autonomous AI E2E Verification & Playtest Contract (v2.0)

- **Status**: `Locked`
- **Last Updated**: 2026-11-24

---

## 1. Browser Execution Profile

Playwright runs **Chromium** (`channel: "chromium"`) emulating **iPhone 16** (`393×852 @3x`, `hasTouch: true`, `isMobile: true`) on `http://localhost:4173` with SwiftShader Vulkan WebGPU flags (`--enable-unsafe-webgpu --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --enable-features=Vulkan --use-vulkan=swiftshader --ignore-gpu-blocklist`).

---

## 2. Required Test Bridge (`window.__GAME_TEST__`)

Exposes:
- `ready(): Promise<void>`
- `getState()` — includes `screen` (`'menu' | 'playing'`), `themeIndex` (`0..4`), `themeName`, `timeOverrideEnabled`, `timeOfDayHours`, `score`, `streak`, `maxStreak`, `multiplier`, `directCount`, `trayUses`, `undoUsed`, `stars`, `layersCompleted`, `totalLayers`, `trayTension`, `lastBlockerTileIdx`, `phase`, `tiles[]` (with projected `screenX`/`screenY`), `audio`, `gallery`, `renderer`.
- `stepTicks(ticks)`, `tapTile(idx)`, `undo()`, `hint()`, `reset()`, `loadLevel(idx)`, `loadMandala(seed)`, `loadDaily(dateKey?)`, `setTheme(idx)`, `setTimeOfDayOverride(hours | null)`, `enterGame()`.

---

## 3. Mandatory E2E Verification Gates (v2.0)

1. **Start Menu & Settings**:
   - Boots cleanly onto the **Start Menu** over the live raytraced 3D scene (`screen === 'menu'`), captures `test-results/v2-start-menu.png`.
   - Tests switching all **5 Visual Themes** (`Jewel Atelier`, `Cyber Neon`, `Noir B&W`, `Pop Art`, `Stained Glass`), captures theme screenshots, and asserts visually distinct renders + 0 WebGPU validation errors.
   - Opens **Settings**, toggles **24h Solar Time Override** slider (Noon vs Sunset vs Midnight), verifies lighting updates live, and returns to `Auto` real-world clock sync.
2. **Gameplay Mechanics, Difficulty & Zero-Spoiler Rules**:
   - Enters Journey Level 0 (*Jewel Heart*, `5×5`, 21 pearls — confirms substantial board size `>= 20` pearls).
   - Verifies blocked tile tap highlights `lastBlockerTileIdx >= 0` (causal feedback) without removing the tile.
   - Verifies direct stitch builds `streak` & `multiplier > 1` and increases `score` with rolling display & floating callout.
   - Verifies Undo & Hint work cleanly.
   - Autonomously solves Level 0 completely via real pointer taps until `phase === 'complete'`, verifying `score > 0`, `layersCompleted === totalLayers`, `stars >= 1`, `audio.notesScheduled > 0`, and Gallery persistence across `page.reload()`.
3. **PWA, Touch Targets, Battery & Zero Errors**:
   - Zero console errors, zero page errors, zero WebGPU validation errors, zero HTTP >= 400 responses, zero overflow, idle battery throttle verified.
