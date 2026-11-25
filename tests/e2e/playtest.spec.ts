import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('Pearl Loom v2.9 — iPhone 16 WebGPU Special Pearls, Live Config & 4 Seeded Difficulties E2E Playtest', () => {
  test('verifies Live config.json, Gradual Special Pearl Rollout (3D Heart, Rainbow, Hidden, Locked), 4 Seeded Difficulty Tiers, Sequential Locking, Anti-Aliased Visual Pop & 0-FPS Idle', async ({
    page,
    request,
  }) => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Verify PWA manifest, icons, SW, WASM, live config.json & v3 52-level JSON endpoints
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.name).toBe('Pearl Loom');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.start_url).toBe('./');

    expect((await request.get('/sw.js')).status()).toBe(200);
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
    expect((await request.get('/game.wasm')).status()).toBe(200);

    const configRes = await request.get('/config.json');
    expect(configRes.status()).toBe(200);
    const configJson = await configRes.json();
    expect(configJson.version).toBe(1);
    expect(configJson.jiggle.intervalMs).toBeGreaterThan(0);
    expect(configJson.lighting.topLightIntensity).toBeGreaterThan(0);
    expect(configJson.feedback.rumbleIntensity).toBeGreaterThan(0);

    const levelsRes = await request.get('/levels.json');
    expect(levelsRes.status()).toBe(200);
    const levelsJson = await levelsRes.json();
    expect(levelsJson.version).toBe(3);
    expect(levelsJson.chapters.length).toBe(4);
    expect(levelsJson.levels.length).toBe(52);

    // 2. Load Pearl Loom v2.9 on localhost (secure context for WebGPU)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    // 3. Verify Campaign-First Start Menu (4 Day-1 campaigns, clean UI, zero overflow, touch targets >= 36px)
    const menuAudit = await page.evaluate(() => {
      const capable = document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute('content');
      const viewport = document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute('content');
      const selectors = [
        '#btn-menu-settings',
        '#btn-mode-journey',
        '#btn-mode-daily',
        '#btn-mode-endless',
        '#btn-menu-gallery',
      ];
      const buttons = selectors.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        return {
          sel,
          text: el?.textContent?.trim() ?? '',
          aria: el?.getAttribute('aria-label') ?? '',
          height: rect?.height ?? 0,
          inBounds:
            rect != null &&
            rect.width > 0 &&
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= window.innerWidth + 1 &&
            rect.bottom <= window.innerHeight + 1,
        };
      });
      return {
        capable,
        viewport,
        noOverflowX: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        noOverflowY: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
        hasRemovedTimeBtn: Boolean(document.querySelector('#btn-menu-solar')),
        hasRemovedInstallBtn: Boolean(document.querySelector('#btn-menu-install')),
        campaignPillCount: document.querySelectorAll('#menu-campaign-strip .menu-campaign-pill').length,
        chapterPillText: document.querySelector('#menu-chapter-label')?.textContent?.trim() ?? '',
        buttons,
      };
    });

    expect(menuAudit.capable).toBe('yes');
    expect(menuAudit.viewport).toContain('viewport-fit=cover');
    expect(menuAudit.noOverflowX).toBe(true);
    expect(menuAudit.noOverflowY).toBe(true);
    expect(menuAudit.hasRemovedTimeBtn).toBe(false);
    expect(menuAudit.hasRemovedInstallBtn).toBe(false);
    expect(menuAudit.campaignPillCount).toBe(4);
    expect(menuAudit.chapterPillText).toContain('4 CAMPAIGNS');
    for (const btn of menuAudit.buttons) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
      expect(btn.text.length + btn.aria.length, `${btn.sel} missing label`).toBeGreaterThan(0);
    }

    const bootState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(bootState.screen).toBe('menu');
    expect(bootState.timeMode).toBe('auto');
    expect(bootState.themeIndex).toBe(0);
    expect(bootState.configSource).toBe('network');
    expect(bootState.config.jiggle.intervalMs).toBe(configJson.jiggle.intervalMs);
    expect(bootState.levelsCatalog.source).toBe('network');
    expect(bootState.levelsCatalog.version).toBe(3);
    expect(bootState.levelsCatalog.count).toBe(52);
    expect(bootState.renderer.validationErrors).toEqual([]);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'start-menu.png') });

    // Switch Start Menu campaign pill to Cyber Arcade (Day-1 unlocked!) & back to Jewel Atelier
    await page.locator('#menu-campaign-strip .menu-campaign-pill[data-campaign-id="1"]').click();
    await expect(page.locator('#menu-journey-main')).toHaveText('Play Neon Spark');
    await expect(page.locator('#menu-journey-meta')).toContainText('No Blockers');
    const neonPreviewState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(neonPreviewState.themeIndex).toBe(1);
    await page.locator('#menu-campaign-strip .menu-campaign-pill[data-campaign-id="0"]').click();
    await expect(page.locator('#menu-journey-main')).toHaveText('Play Sunbeam Brooch');

    // 4. Verify Sequential Level Locking + 4-Tier Endless/Seed Difficulty Picker inside Campaigns Map!
    await page.locator('#btn-menu-gallery').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await expect(page.locator('#chapter-tabs .chapter-tab')).toHaveCount(4);
    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(13);
    await expect(page.locator('#seed-diff-picker .seed-diff-pill')).toHaveCount(4);
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="0"]')).toHaveAttribute('data-locked', 'false');
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="0"]')).toHaveClass(/is-current/);
    await expect(page.locator('#gallery-grid .gallery-item[data-locked="true"]')).toHaveCount(12);

    // Clicking locked Level 2 MUST NOT launch it or close the Campaigns drawer!
    await page.locator('#gallery-grid .gallery-item[data-level-index="1"]').click({ force: true });
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'gallery-drawer.png') });
    await page.locator('#btn-close-gallery').click();
    await expect(page.locator('#overlay-gallery')).toBeHidden();

    // 5. Verify Settings Drawer, Direct-Tap iOS Haptic Switch, Settings Install Guide & 24h Lighting Override
    const hapticSwitchAudit = await page.evaluate(() => {
      const sw = document.querySelector('#ios-haptic-switch') as HTMLInputElement | null;
      const layer = document.querySelector('#canvas-haptic-layer') as HTMLLabelElement | null;
      const swStyle = sw ? getComputedStyle(sw) : null;
      return {
        hasSwitch: Boolean(sw && sw.type === 'checkbox' && sw.hasAttribute('switch')),
        notDisplayNone: Boolean(swStyle && swStyle.display !== 'none' && swStyle.visibility !== 'hidden'),
        hasCanvasLabel: Boolean(layer && layer.htmlFor === 'ios-haptic-switch'),
      };
    });
    expect(hapticSwitchAudit.hasSwitch).toBe(true);
    expect(hapticSwitchAudit.notDisplayNone).toBe(true);
    expect(hapticSwitchAudit.hasCanvasLabel).toBe(true);

    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#overlay-settings')).toBeVisible();
    await expect(page.locator('#btn-test-haptic')).toBeVisible();
    await expect(page.locator('#settings-install-card')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'settings-drawer.png') });

    await page.locator('[data-solar-preset="18.25"]').click();
    const afterSunset = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterSunset.timeMode).toBe('manual');
    expect(Math.abs(afterSunset.timeOfDayHours - 18.25)).toBeLessThan(0.1);

    await page.locator('#btn-solar-auto').click();
    const afterAuto = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterAuto.timeMode).toBe('auto');

    await page.locator('#btn-settings-install').click();
    await expect(page.locator('#overlay-install')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'install-guide.png') });
    await page.locator('#btn-close-install').click();
    await expect(page.locator('#overlay-install')).toBeHidden();

    // 6. Launch Jewel Atelier Level 1 (Sunbeam Brooch — Zero-Blocker, Zero-Specials Warm-Up!), solve it & verify Level 2 UNLOCKS!
    await page.locator('#btn-mode-journey').click();
    await expect(page.locator('#overlay-start-menu')).toBeHidden();
    await expect(page.locator('#hud-top')).toBeVisible();

    const warmupStart = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(warmupStart.levelIndex).toBe(0);
    expect(warmupStart.totalPearls).toBe(14);
    expect(warmupStart.tiles.every((t) => t.unblocked), 'Level 1 Warm-Up must have 0 blockers').toBe(true);
    expect(warmupStart.tiles.every((t) => t.special === 'none'), 'Level 1 Warm-Up must start with ZERO special pearls').toBe(true);

    await page.evaluate(async () => {
      for (let i = 0; i < 16; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const target =
          cur.tiles.find((t) => t.alive && t.unblocked && cur.activeColors.includes(t.color)) ??
          cur.tiles.find((t) => t.alive && t.unblocked);
        if (!target) break;
        window.__GAME_TEST__!.tapTile(target.index);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(28, false);
    });
    const warmupDone = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(warmupDone.phase).toBe('complete');
    expect(warmupDone.stitchedCount).toBe(14);
    expect(warmupDone.gallery.completedCuratedIds).toContain(0);
    await expect(page.locator('#overlay-complete')).toBeVisible();
    await expect(page.locator('#complete-title')).toHaveText('Sunbeam Brooch');
    await expect(page.locator('#complete-bonus-line')).toContainText('Unlocked #2 Dewdrop Ring');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'completed-warmup.png') });

    // Clicking Next advances directly to newly unlocked Level 2 (Dewdrop Ring), while Level 3 stays locked!
    await page.locator('#btn-next-level').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const lvl2State = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(lvl2State.levelIndex).toBe(1);
    expect(lvl2State.totalPearls).toBe(16);
    expect(lvl2State.tiles.every((t) => t.unblocked), 'Level 2 Warm-Up must also have 0 blockers').toBe(true);
    expect(lvl2State.tiles.every((t) => t.special === 'none'), 'Level 2 Warm-Up must also have 0 specials').toBe(true);

    await page.locator('#btn-pattern').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="0"]')).toHaveClass(/is-completed/);
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="1"]')).toHaveAttribute('data-locked', 'false');
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="1"]')).toHaveClass(/is-current/);
    await expect(page.locator('#gallery-grid .gallery-item[data-level-index="2"]')).toHaveAttribute('data-locked', 'true');
    // Verify 0-FPS pause while Campaigns drawer is open
    const framesAtOpen = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    await page.waitForTimeout(300);
    const framesAfterWait = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    expect(framesAfterWait).toBe(framesAtOpen);
    await page.locator('#btn-close-gallery').click();

    // 7. Verify ALL 4 Campaigns render distinctly with crisp 3D Sculpted Heart Pearls on Level 3!
    const chapterSamples = [
      { level: 2, expectedTheme: 0, file: 'theme-0-jewel.png', label: 'Jewel Atelier (Jewel Heart — 3D Heart Pearls)' },
      { level: 15, expectedTheme: 1, file: 'theme-1-neon.png', label: 'Cyber Arcade (Neon Pulse — 3D Heart Pearls)' },
      { level: 28, expectedTheme: 2, file: 'theme-2-popart.png', label: 'Pop Studio (Comic Star — 3D Heart Pearls)' },
      { level: 41, expectedTheme: 3, file: 'theme-3-prism.png', label: 'Cathedral Glass (Prism Lantern — 3D Heart Pearls)' },
    ];
    const themeCaptures: Buffer[] = [];
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(12.5);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    for (const sample of chapterSamples) {
      await page.evaluate(async (lvl) => {
        window.__GAME_TEST__!.loadLevel(lvl);
        await window.__GAME_TEST__!.stepTicks(4);
      }, sample.level);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.themeIndex, `${sample.label} native theme mismatch`).toBe(sample.expectedTheme);
      expect(st.tiles.filter((t) => t.alive && t.special === 'heart').length, `${sample.label} must have 3D Heart Pearls`).toBeGreaterThanOrEqual(1);
      expect(st.tiles.filter((t) => t.special === 'rainbow' || t.special === 'hidden' || t.special === 'locked').length).toBe(0);
      expect(st.renderer.validationErrors).toEqual([]);
      const buf = await page.screenshot({ path: path.join(RESULTS_DIR, sample.file) });
      expect(buf.byteLength).toBeGreaterThan(8_000);
      themeCaptures.push(buf);
    }
    for (let i = 0; i < themeCaptures.length; i++) {
      for (let j = i + 1; j < themeCaptures.length; j++) {
        expect(Buffer.compare(themeCaptures[i], themeCaptures[j]), `Campaign theme ${i} vs ${j} identical`).not.toBe(0);
      }
    }

    // Automated Visual Pop & Contrast Regression Guard
    const analyzeCanvasPng = async (png: Buffer) => {
      const b64 = png.toString('base64');
      return page.evaluate(async (dataUrl) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const w = 96;
        const h = 208;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const y0 = Math.floor(h * 0.15);
        const y1 = Math.floor(h * 0.85);
        const data = ctx.getImageData(0, y0, w, y1 - y0).data;
        const lums: number[] = [];
        const sats: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          lums.push(0.299 * r + 0.587 * g + 0.114 * b);
          sats.push(maxC > 0.05 ? (maxC - minC) / maxC : 0);
        }
        lums.sort((a, b) => a - b);
        sats.sort((a, b) => a - b);
        const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
        return {
          p10Lum: pct(lums, 0.1),
          p95Lum: pct(lums, 0.95),
          p95Sat: pct(sats, 0.95),
        };
      }, `data:image/png;base64,${b64}`);
    };

    const jewelMetrics = await analyzeCanvasPng(themeCaptures[0]);
    const neonMetrics = await analyzeCanvasPng(themeCaptures[1]);
    const popMetrics = await analyzeCanvasPng(themeCaptures[2]);
    const prismMetrics = await analyzeCanvasPng(themeCaptures[3]);

    expect(jewelMetrics.p95Lum - jewelMetrics.p10Lum, 'Jewel Atelier contrast too flat').toBeGreaterThan(0.35);
    expect(jewelMetrics.p95Sat, 'Jewel Atelier colors too washed-out').toBeGreaterThan(0.55);
    expect(neonMetrics.p10Lum, 'Cyber Neon dark floor washed out').toBeLessThan(0.38);
    expect(neonMetrics.p95Sat, 'Cyber Neon colors too dull').toBeGreaterThan(0.60);
    expect(popMetrics.p95Sat, 'Pop Art colors too dull').toBeGreaterThan(0.65);
    expect(prismMetrics.p95Sat, 'Cathedral Glass colors too dull').toBeGreaterThan(0.55);

    // 7b. Verify full 8x8 Grand Masterpiece (Level 12) showcases ALL 4 Special Pearls: 3D Heart, Rainbow, Hidden ?, Locked!
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(12); // Grand Jewel Rose (8x8, 62 hoop + 2 Rainbow = 64 tiles!)
      await window.__GAME_TEST__!.stepTicks(4);
    });
    const finale8x8 = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(finale8x8.gridCols).toBe(8);
    expect(finale8x8.gridRows).toBe(8);
    expect(finale8x8.totalPearls).toBe(62);
    expect(finale8x8.tiles.length).toBe(64);
    expect(finale8x8.tiles.filter((t) => t.special === 'heart').length).toBeGreaterThanOrEqual(1);
    expect(finale8x8.tiles.filter((t) => t.special === 'rainbow').length).toBeGreaterThanOrEqual(1);
    expect(finale8x8.tiles.filter((t) => t.special === 'hidden' && t.hiddenConcealed).length).toBeGreaterThanOrEqual(1);
    expect(finale8x8.tiles.filter((t) => t.special === 'locked' && t.lockedNow).length).toBeGreaterThanOrEqual(1);
    expect(finale8x8.renderer.validationErrors).toEqual([]);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'campaign-8x8-finale.png') });

    // Verify independent Rainbow wiggle & Locked Pearl guard directly on the 8x8 finale!
    const rainWigIdx = await page.evaluate(() => window.__GAME_TEST__!.triggerRainbowWiggle());
    expect(rainWigIdx).toBeGreaterThanOrEqual(0);
    expect(finale8x8.tiles[rainWigIdx]?.special).toBe('rainbow');

    const lockedTile = finale8x8.tiles.find((t) => t.alive && t.lockedNow);
    expect(lockedTile, '8x8 finale must contain a locked pearl').toBeTruthy();
    if (lockedTile) {
      const beforeLockTap = finale8x8.events.lockedTapEvents;
      const tappedOk = await page.evaluate((idx) => window.__GAME_TEST__!.tapTile(idx), lockedTile.index);
      expect(tappedOk).toBe(false);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(2));
      const afterLockTap = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(afterLockTap.events.lockedTapEvents).toBeGreaterThan(beforeLockTap);
      expect(afterLockTap.tiles[lockedTile.index].alive).toBe(true);
    }

    // 8. Verify Causal Blocker Highlight, Periodic Wiggle, Hint (-250) & Undo (-150) on Level 3 (Jewel Heart, 5x5)
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(10.5);
      window.__GAME_TEST__!.loadLevel(2);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    const startSnap = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(startSnap.totalPearls).toBe(21);
    const blockedTile = startSnap.tiles.find((t) => t.alive && !t.unblocked);
    expect(blockedTile, 'Level 3 Jewel Heart must contain interlocking blocked tiles').toBeTruthy();
    if (blockedTile) {
      await page.mouse.click(blockedTile.screenX * 393, blockedTile.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(2));
      const afterBlocked = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(afterBlocked.events.blockedEvents).toBeGreaterThan(startSnap.events.blockedEvents);
      expect(afterBlocked.lastBlockerIdx).toBeGreaterThanOrEqual(0);
      expect(afterBlocked.tiles[blockedTile.index].alive).toBe(true);
    }

    // Periodic wiggle & ACES-matched 3D HUD swatches
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(230, true);
    });
    const wiggleIdx = await page.evaluate(() => window.__GAME_TEST__!.triggerActiveWiggle());
    const afterWiggle = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(wiggleIdx).toBeGreaterThanOrEqual(0);
    const wiggledTile = afterWiggle.tiles[wiggleIdx];
    expect(wiggledTile?.alive).toBe(true);
    expect(
      afterWiggle.activeColors.includes(wiggledTile?.color ?? -1) || wiggledTile?.isHeart === true,
    ).toBe(true);
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(40, true);
    });
    const afterWiggleSettle = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterWiggleSettle.isAnimating).toBe(false);

    // Direct stitches -> Hint (-250) -> Undo (-150)
    await page.evaluate(async () => {
      const st = window.__GAME_TEST__!.getState();
      const direct = st.tiles.filter((t) => t.alive && t.unblocked && st.activeColors.includes(t.color));
      for (const tile of direct.slice(0, 2)) {
        window.__GAME_TEST__!.tapTile(tile.index);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
    });
    const beforeHint = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(beforeHint.score).toBeGreaterThanOrEqual(200);
    await page.locator('#btn-hint').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const afterHint = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterHint.hintsUsed).toBe(1);
    expect(afterHint.score).toBeLessThan(beforeHint.score);

    await page.locator('#btn-undo').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const afterUndo = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterUndo.undoUsed).toBe(1);
    expect(afterUndo.streak).toBe(0);

    // 9. Verify 4 Seeded Difficulty Tiers (Easy 5x5 -> Extreme 8x8) & Custom Seed UI!
    const expectedDims = [
      { tier: 0 as const, dim: 5 },
      { tier: 1 as const, dim: 6 },
      { tier: 2 as const, dim: 7 },
      { tier: 3 as const, dim: 8 },
    ];
    for (const cfg of expectedDims) {
      await page.evaluate(async ({ tier }) => {
        window.__GAME_TEST__!.loadMandala(7772026, tier);
        await window.__GAME_TEST__!.stepTicks(3);
      }, cfg);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.mode).toBe('mandala');
      expect(st.seedDifficulty).toBe(cfg.tier);
      expect(st.gridCols).toBe(cfg.dim);
      expect(st.gridRows).toBe(cfg.dim);
      if (cfg.tier === 0) {
        expect(st.tiles.filter((t) => t.special === 'rainbow' || t.special === 'hidden' || t.special === 'locked').length).toBe(0);
      } else if (cfg.tier === 1) {
        expect(st.tiles.filter((t) => t.special === 'rainbow').length).toBeGreaterThanOrEqual(1);
        expect(st.tiles.filter((t) => t.special === 'hidden' || t.special === 'locked').length).toBe(0);
      } else if (cfg.tier === 2) {
        expect(st.tiles.filter((t) => t.special === 'hidden').length).toBeGreaterThanOrEqual(1);
        expect(st.tiles.filter((t) => t.special === 'locked').length).toBe(0);
      } else if (cfg.tier === 3) {
        expect(st.tiles.filter((t) => t.special === 'heart').length).toBeGreaterThanOrEqual(1);
        expect(st.tiles.filter((t) => t.special === 'rainbow').length).toBeGreaterThanOrEqual(1);
        expect(st.tiles.filter((t) => t.special === 'hidden').length).toBeGreaterThanOrEqual(1);
        expect(st.tiles.filter((t) => t.special === 'locked').length).toBeGreaterThanOrEqual(1);
        await page.screenshot({ path: path.join(RESULTS_DIR, 'seeded-extreme-8x8.png') });
      }
    }

    // Select Medium (6x6) via the UI radio pill + play custom seed 20261125 and verify parity with Daily Stitch!
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadDaily(20261125);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    const dailySt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(dailySt.mode).toBe('daily');
    expect(dailySt.seed).toBe(20261125);

    await page.locator('#btn-pattern').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await page.locator('#seed-diff-picker .seed-diff-pill[data-seed-difficulty="1"]').click();
    await page.locator('#input-custom-seed').fill('20261125');
    await page.locator('#btn-play-seed').click();
    await expect(page.locator('#overlay-gallery')).toBeHidden();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const customSeedSt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(customSeedSt.mode).toBe('mandala');
    expect(customSeedSt.seed).toBe(20261125);
    expect(customSeedSt.seedDifficulty).toBe(1);
    expect(customSeedSt.levelName).toBe('Medium #20261125');
    expect(customSeedSt.themeIndex).toBe(dailySt.themeIndex);
    expect(customSeedSt.totalPearls).toBe(dailySt.totalPearls);

    // 10. Reload page and verify Campaign progress, Level 2 unlock & persisted Seed Difficulty survive reload!
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });
    const reloaded = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(reloaded.screen).toBe('menu');
    expect(reloaded.gallery.completedCuratedIds).toContain(0);
    expect(reloaded.gallery.seedDifficulty).toBe(1);
    await expect(page.locator('#menu-journey-main')).toHaveText('Play Dewdrop Ring');

    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `Page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(failedResponses, `Failed HTTP responses: ${failedResponses.join('\n')}`).toEqual([]);
  });
});
