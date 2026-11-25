import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('Pearl Loom v2.2 — iPhone 16 WebGPU Raytraced Autonomous E2E Playtest', () => {
  test('verifies Streamlined Start Menu, 4 Vibrant Chapters (32 levels, no Noir), Anti-Aliased Visual Pop, Solo Finale Solve, Pinch-Rescue Hints, Daily Stitch & True 0-FPS Idle', async ({
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

    // 1. Verify PWA manifest, icons, SW & WASM endpoints (subpath-portable)
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
    const levelsRes = await request.get('/levels.json');
    expect(levelsRes.status()).toBe(200);
    const levelsJson = await levelsRes.json();
    expect(levelsJson.chapters.length).toBe(4);
    expect(levelsJson.levels.length).toBe(32);

    // 2. Load Pearl Loom v2.7 on localhost (secure context for WebGPU)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    // 3. Verify Clean Start Menu (no redundant Time or Install buttons, no technical jargon, touch targets >= 36px)
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
    expect(menuAudit.chapterPillText).toContain('CHAPTER I');
    for (const btn of menuAudit.buttons) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
      expect(btn.text.length + btn.aria.length, `${btn.sel} missing label`).toBeGreaterThan(0);
    }

    const bootState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(bootState.screen).toBe('menu');
    expect(bootState.timeMode).toBe('auto');
    expect(bootState.themeIndex).toBe(0);
    expect(bootState.levelsCatalog.source).toBe('network');
    expect(bootState.levelsCatalog.count).toBe(32);
    expect(bootState.renderer.validationErrors).toEqual([]);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'start-menu.png') });

    // 4. Verify Settings Drawer, Direct-Tap iOS Haptic Switch, Settings Install Guide & 24h Lighting Override
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

    // Settings Install button opens the iOS 26 Safari 3-step Add to Home Screen guide cleanly
    await page.locator('#btn-settings-install').click();
    await expect(page.locator('#overlay-install')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'install-guide.png') });
    await page.locator('#btn-close-install').click();
    await expect(page.locator('#overlay-install')).toBeHidden();

    // 5. Enter Gameplay via Start Menu "Play Jewel Heart" & audit Gameplay HUD
    await page.locator('#btn-mode-journey').click();
    await expect(page.locator('#overlay-start-menu')).toBeHidden();
    await expect(page.locator('#hud-top')).toBeVisible();

    const hudAudit = await page.evaluate(() => {
      const selectors = ['#btn-home', '#btn-pattern', '#btn-settings', '#btn-audio', '#btn-undo', '#btn-hint', '#btn-reset'];
      return selectors.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        return {
          sel,
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
    });
    for (const btn of hudAudit) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
    }

    // 6. Verify ALL 4 Vibrant Native Chapters render distinctly with crisp anti-aliased pop (Noir removed!)
    const chapterSamples = [
      { level: 0, expectedTheme: 0, file: 'theme-0-jewel.png', label: 'Chapter I Jewel Atelier' },
      { level: 8, expectedTheme: 1, file: 'theme-1-neon.png', label: 'Chapter II Cyber Arcade' },
      { level: 16, expectedTheme: 2, file: 'theme-2-popart.png', label: 'Chapter III Pop Studio' },
      { level: 24, expectedTheme: 3, file: 'theme-3-prism.png', label: 'Chapter IV Cathedral Glass' },
    ];
    const themeCaptures: Buffer[] = [];
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(12.5);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    for (const sample of chapterSamples) {
      await page.evaluate(async (lvl) => {
        window.__GAME_TEST__!.loadLevel(lvl);
        // Step 4 ticks so Peak 1 of the 3.5s pure additive interior glow is clearly visible on active colors!
        await window.__GAME_TEST__!.stepTicks(4);
      }, sample.level);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.themeIndex, `${sample.label} native theme mismatch`).toBe(sample.expectedTheme);
      expect(st.renderer.validationErrors).toEqual([]);
      const buf = await page.screenshot({ path: path.join(RESULTS_DIR, sample.file) });
      expect(buf.byteLength).toBeGreaterThan(8_000);
      themeCaptures.push(buf);
    }
    for (let i = 0; i < themeCaptures.length; i++) {
      for (let j = i + 1; j < themeCaptures.length; j++) {
        expect(Buffer.compare(themeCaptures[i], themeCaptures[j]), `Chapter theme ${i} vs ${j} identical`).not.toBe(0);
      }
    }

    // Automated Visual Pop & Contrast Regression Guard (catches double-gamma washout / mushy pastels early!)
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

    // 7. Verify 24h Solar Lighting contrast on Jewel Atelier (Noon vs Golden Hour vs Night)
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(0);
      window.__GAME_TEST__!.setTimeOfDayOverride(18.25);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    const goldenPng = await page.screenshot({ path: path.join(RESULTS_DIR, 'solar-golden.png') });
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(23.0);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    const nightPng = await page.screenshot({ path: path.join(RESULTS_DIR, 'solar-night.png') });
    expect(Buffer.compare(themeCaptures[0], goldenPng)).not.toBe(0);
    expect(Buffer.compare(themeCaptures[0], nightPng)).not.toBe(0);
    expect(Buffer.compare(goldenPng, nightPng)).not.toBe(0);

    // Return to crisp sunlit morning (10.5h) on Level 0 (Jewel Heart, 5x5, 21 pearls)
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(10.5);
      window.__GAME_TEST__!.loadLevel(0);
      await window.__GAME_TEST__!.stepTicks(3);
    });

    // 8. Test Blocked Tile Causal Blocker Highlight & Impact Beam via REAL canvas click
    const startSnap = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(startSnap.totalPearls).toBe(21);
    const blockedTile = startSnap.tiles.find((t) => t.alive && !t.unblocked);
    expect(blockedTile, '5x5 Jewel Heart must contain interlocking blocked tiles').toBeTruthy();
    if (blockedTile) {
      await page.mouse.click(blockedTile.screenX * 393, blockedTile.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(2));
      const afterBlocked = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(afterBlocked.events.blockedEvents).toBeGreaterThan(startSnap.events.blockedEvents);
      expect(afterBlocked.lastBlockerIdx).toBeGreaterThanOrEqual(0);
      expect(afterBlocked.tiles[blockedTile.index].alive).toBe(true);
      await page.screenshot({ path: path.join(RESULTS_DIR, 'blocker-feedback.png') });
    }

    // 8b. Verify Heart Pearls (1..3 per level), Zero-Spoiler Periodic Wiggle & ACES-Matched 3D HUD Swatch Variables
    const initialHearts = startSnap.tiles.filter((t) => t.alive && t.isHeart);
    expect(initialHearts.length).toBeGreaterThanOrEqual(1);
    expect(initialHearts.length).toBeLessThanOrEqual(3);

    const swatchVars = await page.evaluate(() => {
      const dot = document.querySelector('#swatch-list .swatch-dot') as HTMLElement | null;
      return dot
        ? {
            hi: dot.style.getPropertyValue('--sw-hi'),
            mid: dot.style.getPropertyValue('--sw-mid'),
            lo: dot.style.getPropertyValue('--sw-lo'),
          }
        : null;
    });
    expect(swatchVars).not.toBeNull();
    expect(swatchVars!.hi).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatchVars!.mid).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatchVars!.lo).toMatch(/^#[0-9a-f]{6}$/i);

    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(230, true);
    });
    const wiggleIdx = await page.evaluate(() => window.__GAME_TEST__!.triggerActiveWiggle());
    const afterWiggle = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(wiggleIdx).toBeGreaterThanOrEqual(0);
    const wiggledTile = afterWiggle.tiles[wiggleIdx];
    expect(wiggledTile?.alive).toBe(true);
    expect(
      afterWiggle.activeColors.includes(wiggledTile?.color ?? -1) || wiggledTile?.isHeart === true
    ).toBe(true);
    expect(afterWiggle.isAnimating).toBe(true);
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(40, true);
    });
    const afterWiggleSettle = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterWiggleSettle.isAnimating).toBe(false);

    // 9. Test Direct Stitches -> Hint (-250 score deduction) -> Undo (-150 score deduction)
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
    expect(afterHint.hintTileIndex).toBeGreaterThanOrEqual(0);
    expect(afterHint.hintsUsed).toBe(1);
    expect(afterHint.score).toBeLessThan(beforeHint.score);

    const scoreBeforeUndo = afterHint.score;
    await page.locator('#btn-undo').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const afterUndo = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterUndo.undoUsed).toBe(1);
    expect(afterUndo.streak).toBe(0);
    expect(afterUndo.score).toBeLessThanOrEqual(scoreBeforeUndo);

    // 10. Autonomously solve the entire 21-pearl 5x5 Jewel Heart (exercising Solo Finale endgame rule!)
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(0);
      await window.__GAME_TEST__!.stepTicks(3, true);
    });

    for (let step = 0; step < 4; step++) {
      const cur = await page.evaluate(() => window.__GAME_TEST__!.getState());
      if (cur.phase === 'complete') break;
      const target =
        cur.tiles.find((t) => t.alive && t.unblocked && cur.activeColors.includes(t.color)) ??
        cur.tiles.find((t) => t.alive && t.unblocked);
      expect(target).toBeTruthy();
      await page.mouse.click(target!.screenX * 393, target!.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(24, true));
    }

    // Mid-puzzle streak render (after 4.0s spotlight settled, all pearls show calm natural luster!)
    await page.evaluate(async () => {
      for (let i = 0; i < 7; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const h = window.__GAME_TEST__!.hint();
        if (h < 0) break;
        window.__GAME_TEST__!.tapTile(h);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(260, false);
    });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'mid-puzzle-streak.png') });

    // Finish remaining pearls of Jewel Heart & verify completion modal appears FAST (~0.45s, not 2+s lag!)
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const h = window.__GAME_TEST__!.hint();
        if (h < 0) break;
        window.__GAME_TEST__!.tapTile(h);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      // Only 28 ticks (~0.46s) after the final pearl tap -> modal MUST already be visible!
      await window.__GAME_TEST__!.stepTicks(28, false);
    });
    const completed = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(completed.phase).toBe('complete');
    expect(completed.flyingCount).toBe(0);
    expect(completed.stitchedCount).toBe(21);
    expect(completed.totalPearls).toBe(21);
    expect(completed.trayColors).toEqual([]);
    expect(completed.score).toBeGreaterThan(2000);
    expect(completed.maxStreak).toBeGreaterThanOrEqual(4);
    expect(completed.stars).toBeGreaterThanOrEqual(1);
    expect(completed.layersComplete).toBe(completed.totalLayers);
    expect(completed.events.heartClearEvents).toBeGreaterThanOrEqual(1);
    expect(completed.audio.initialized).toBe(true);
    expect(completed.audio.notesScheduled).toBeGreaterThan(0);
    expect(completed.gallery.completedCuratedIds).toContain(0);

    await expect(page.locator('#overlay-complete')).toBeVisible();
    await expect(page.locator('#complete-title')).toHaveText('Jewel Heart');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'completed-jewel-heart.png') });

    // 11. Test Chapter-Tabbed Gallery (4 Vibrant Chapter tabs x 8 patterns), 0-FPS pause & Cyber Arcade launch
    await page.locator('#btn-next-level').click();
    await page.locator('#btn-pattern').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await expect(page.locator('#chapter-tabs .chapter-tab')).toHaveCount(4);
    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(8);
    await expect(page.locator('#gallery-grid .gallery-item.is-completed')).toHaveCount(1);

    const framesAtOpen = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    await page.waitForTimeout(300);
    const framesAfterWait = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    expect(framesAfterWait).toBe(framesAtOpen);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'gallery-drawer.png') });

    // Switch to Chapter II (Cyber Arcade) tab and launch Neon Pulse (Level 8)
    await page.locator('#chapter-tabs .chapter-tab[data-chapter-id="1"]').click();
    await expect(page.locator('#chapter-banner-title')).toContainText('Cyber Arcade');
    await page.locator('#gallery-grid .gallery-item[data-level-index="8"]').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const cyberLoaded = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(cyberLoaded.levelIndex).toBe(8);
    expect(cyberLoaded.themeIndex).toBe(1);

    // Launch Daily Stitch (20261125) & verify native theme + smart hint
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadDaily(20261125);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    const dailySt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(dailySt.mode).toBe('daily');
    expect(dailySt.seed).toBe(20261125);
    expect(dailySt.themeIndex).toBeGreaterThanOrEqual(0);
    expect(dailySt.themeIndex).toBeLessThan(4);
    const dailyHint = await page.evaluate(() => window.__GAME_TEST__!.hint());
    expect(dailyHint).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'daily-stitch.png') });

    // 11b. Test Custom Seed Input UI inside Chapters & Seeds drawer:
    // Entering 20261125 as a custom seed MUST generate the exact same theme & tile count as Daily 20261125!
    await page.locator('#btn-pattern').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await page.locator('#input-custom-seed').fill('20261125');
    await page.locator('#btn-play-seed').click();
    await expect(page.locator('#overlay-gallery')).toBeHidden();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const customSeedSt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(customSeedSt.mode).toBe('mandala');
    expect(customSeedSt.seed).toBe(20261125);
    expect(customSeedSt.levelName).toBe('Pattern #20261125');
    expect(customSeedSt.themeIndex).toBe(dailySt.themeIndex);
    expect(customSeedSt.totalPearls).toBe(dailySt.totalPearls);

    // Reload page and confirm Gallery persistence survives full browser reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(() => window.__GAME_TEST__!.ready());
    const reloaded = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(reloaded.gallery.completedCuratedIds).toContain(0);

    // 12. Verify 3.5s additive interior pulse decays cleanly AND true 0-FPS idle battery mode engages!
    await page.evaluate(async () => {
      // Step past the 3.5s temporary start glow (230 ticks = 3.83s)
      await window.__GAME_TEST__!.stepTicks(230);
    });
    await page.waitForFunction(
      () => {
        const s = window.__GAME_TEST__?.getState();
        return Boolean(s && !s.isAnimating && s.renderer.isIdleThrottled);
      },
      undefined,
      { timeout: 4_000 },
    );
    const idleFramesBefore = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    await page.waitForTimeout(550);
    const idleFramesAfter = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    expect(idleFramesAfter, 'True 0-FPS idle must submit ZERO frames while contemplating').toBe(idleFramesBefore);

    const finalState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(finalState.renderer.validationErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
