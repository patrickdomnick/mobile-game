import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('Pearl Loom v2.0 — iPhone 16 WebGPU Raytraced Autonomous E2E Playtest', () => {
  test('verifies Start Menu, 24h Solar Auto+Override, all 5 Visual Themes, Zero-Spoiler Causal Blocker FX, Balatro/VS scoring & full 5x5 solve', async ({
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

    // 2. Load Pearl Loom v2.0 on localhost (secure context for WebGPU)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    // 3. Verify Living Start Menu, Safari standalone tags, zero overflow & tactile touch targets
    const menuAudit = await page.evaluate(() => {
      const capable = document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute('content');
      const viewport = document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute('content');
      const selectors = [
        '#btn-menu-solar',
        '#btn-menu-settings',
        '#btn-mode-journey',
        '#btn-mode-daily',
        '#btn-mode-endless',
        '#btn-menu-gallery',
        '#btn-menu-open-settings',
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
        themeChipCount: document.querySelectorAll('#menu-theme-strip .theme-chip').length,
        buttons,
      };
    });

    expect(menuAudit.capable).toBe('yes');
    expect(menuAudit.viewport).toContain('viewport-fit=cover');
    expect(menuAudit.noOverflowX).toBe(true);
    expect(menuAudit.noOverflowY).toBe(true);
    expect(menuAudit.themeChipCount).toBe(5);
    for (const btn of menuAudit.buttons) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
      expect(btn.text.length + btn.aria.length, `${btn.sel} missing label`).toBeGreaterThan(0);
    }

    const bootState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(bootState.screen).toBe('menu');
    expect(bootState.timeMode).toBe('auto');
    expect(bootState.themeIndex).toBe(0);
    expect(bootState.renderer.validationErrors).toEqual([]);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'start-menu.png') });

    // 4. Verify Settings Drawer + Real-World 24h Solar Auto & Manual Override
    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#overlay-settings')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'settings-drawer.png') });

    // Click Sunset preset -> switches to manual mode
    await page.locator('[data-solar-preset="18.25"]').click();
    const afterSunset = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterSunset.timeMode).toBe('manual');
    expect(Math.abs(afterSunset.timeOfDayHours - 18.25)).toBeLessThan(0.1);

    // Toggle Auto back ON -> returns to real-world clock
    await page.locator('#btn-solar-auto').click();
    const afterAuto = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterAuto.timeMode).toBe('auto');
    await page.locator('#btn-close-settings').click();
    await expect(page.locator('#overlay-settings')).toBeHidden();

    // 5. Enter Gameplay via Start Menu "Play Curated Patterns" & audit Gameplay HUD
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

    // 6. Verify ALL 5 Visual Themes render distinctly with zero WebGPU validation errors
    const themeCaptures: Buffer[] = [];
    const themeFiles = [
      'theme-0-jewel.png',
      'theme-1-neon.png',
      'theme-2-noir.png',
      'theme-3-popart.png',
      'theme-4-prism.png',
    ];
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(12.5);
      await window.__GAME_TEST__!.stepTicks(3);
    });
    for (let t = 0; t < 5; t++) {
      await page.evaluate(async (idx) => {
        window.__GAME_TEST__!.setTheme(idx);
        await window.__GAME_TEST__!.stepTicks(3);
      }, t);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.themeIndex).toBe(t);
      expect(st.renderer.validationErrors).toEqual([]);
      const buf = await page.screenshot({ path: path.join(RESULTS_DIR, themeFiles[t]) });
      expect(buf.byteLength).toBeGreaterThan(8_000);
      themeCaptures.push(buf);
    }
    // Every visual theme must look genuinely distinct!
    for (let i = 0; i < themeCaptures.length; i++) {
      for (let j = i + 1; j < themeCaptures.length; j++) {
        expect(Buffer.compare(themeCaptures[i], themeCaptures[j]), `Theme ${i} vs ${j} identical`).not.toBe(0);
      }
    }

    // 7. Verify 24h Solar Lighting contrast on Jewel Atelier (Noon vs Golden Hour vs Night)
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTheme(0);
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

    // Return to crisp sunlit morning (10.5h) on Jewel Atelier for gameplay test
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(10.5);
      window.__GAME_TEST__!.loadLevel(0); // Jewel Heart (5x5, 21 pearls, 3 layers)
      await window.__GAME_TEST__!.stepTicks(3);
    });

    // 8. Test Blocked Tile Causal Blocker Highlight & Impact Beam via REAL canvas click
    const startSnap = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(startSnap.totalPearls).toBe(21);
    expect(startSnap.gridCols).toBe(5);
    expect(startSnap.gridRows).toBe(5);
    expect(startSnap.totalLayers).toBe(3);

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

    // 9. Test Hint + Real Tap (Score & Streak increase) + Undo Restoration
    await page.locator('#btn-hint').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const hintedState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(hintedState.hintTileIndex).toBeGreaterThanOrEqual(0);
    const hintedTile = hintedState.tiles[hintedState.hintTileIndex];
    expect(hintedTile.unblocked).toBe(true);

    await page.mouse.click(hintedTile.screenX * 393, hintedTile.screenY * 852);
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(24));
    const afterTap = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterTap.tiles[hintedTile.index].alive).toBe(false);
    expect(afterTap.undoDepth).toBe(1);
    expect(afterTap.score).toBeGreaterThan(0);

    await page.locator('#btn-undo').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const afterUndo = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterUndo.score).toBe(0);
    expect(afterUndo.tiles[hintedTile.index].alive).toBe(true);

    // 10. Autonomously solve the entire 21-pearl 5x5 Jewel Heart (first 4 real canvas clicks + deterministic streak solve)!
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(0);
      await window.__GAME_TEST__!.stepTicks(3, true);
    });

    for (let step = 0; step < 4; step++) {
      const cur = await page.evaluate(() => window.__GAME_TEST__!.getState());
      if (cur.phase === 'complete') break;
      const hintIdx = await page.evaluate(() => window.__GAME_TEST__!.hint());
      expect(hintIdx).toBeGreaterThanOrEqual(0);
      const target = cur.tiles[hintIdx];
      await page.mouse.click(target.screenX * 393, target.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(24, true));
    }

    // Advance to mid-puzzle (11/21 pearls stitched) & render exciting streak screenshot!
    await page.evaluate(async () => {
      for (let i = 0; i < 7; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const h = window.__GAME_TEST__!.hint();
        if (h < 0) break;
        window.__GAME_TEST__!.tapTile(h);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(2, false);
    });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'mid-puzzle-streak.png') });

    // Finish remaining pearls of Jewel Heart & settle completion shimmer
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const h = window.__GAME_TEST__!.hint();
        if (h < 0) break;
        window.__GAME_TEST__!.tapTile(h);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(135, false);
    });
    const completed = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(completed.phase).toBe('complete');
    expect(completed.stitchedCount).toBe(21);
    expect(completed.totalPearls).toBe(21);
    expect(completed.trayColors).toEqual([]);
    expect(completed.score).toBeGreaterThan(5000);
    expect(completed.maxStreak).toBeGreaterThanOrEqual(4);
    expect(completed.stars).toBeGreaterThanOrEqual(1);
    expect(completed.layersComplete).toBe(completed.totalLayers);
    expect(completed.events.colorClearEvents).toBeGreaterThanOrEqual(4);
    expect(completed.events.layerClearEvents).toBeGreaterThanOrEqual(3);
    expect(completed.audio.initialized).toBe(true);
    expect(completed.audio.notesScheduled).toBeGreaterThan(0);
    expect(completed.gallery.completedCuratedIds).toContain(0);

    await expect(page.locator('#overlay-complete')).toBeVisible();
    await expect(page.locator('#complete-title')).toHaveText('Jewel Heart');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'completed-jewel-heart.png') });

    // 11. Advance to Level 1 (Sakura Mandala, 25 pearls), test Gallery 0-FPS pause & Endless/Daily
    await page.locator('#btn-next-level').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const lvl1 = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(lvl1.levelIndex).toBe(1);
    expect(lvl1.levelName).toBe('Sakura Mandala');
    expect(lvl1.totalPearls).toBe(25);

    await page.locator('#btn-pattern').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(8);
    await expect(page.locator('#gallery-grid .gallery-item.is-completed')).toHaveCount(1);
    const framesAtOpen = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    await page.waitForTimeout(320);
    const framesAfterWait = await page.evaluate(() => window.__GAME_TEST__!.getState().renderer.renderedFrames);
    expect(framesAfterWait).toBe(framesAtOpen);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'gallery-drawer.png') });

    // Launch Endless Mandala (30+ pearls) from Gallery
    await page.locator('#btn-endless-mandala').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
    const mandalaState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(mandalaState.mode).toBe('mandala');
    expect(mandalaState.totalPearls).toBeGreaterThanOrEqual(24);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'endless-mandala.png') });

    // Set Cyber Neon theme, reload page, and confirm Gallery & Theme persistence survive full reload!
    await page.evaluate(() => window.__GAME_TEST__!.setTheme(1));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(() => window.__GAME_TEST__!.ready());
    const reloaded = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(reloaded.gallery.completedCuratedIds).toContain(0);
    expect(reloaded.themeIndex).toBe(1);

    // Verify battery-saving idle throttling engages once settled
    await page.waitForFunction(
      () => {
        const s = window.__GAME_TEST__?.getState();
        return Boolean(s && !s.isAnimating && s.renderer.isIdleThrottled);
      },
      undefined,
      { timeout: 6_000 },
    );
    const finalState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(finalState.renderer.validationErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
