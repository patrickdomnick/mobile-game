import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('Pearl Loom v3.0 — iPhone 16 WebGPU Onboarding, Menus, Miniature Previews, Custom Mode & Gameplay E2E', () => {
  test('verifies First-Load 3D Unravel Intro, Tutorial Tooltips & Scoring Guide, 4-Row Start Menu, Theme-Synced 1-Col Level Select, Daily Library, Random Studio, Custom Builder, Special Pearl Tooltips & Full Gameplay', async ({
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

    const levelsRes = await request.get('/levels.json');
    expect(levelsRes.status()).toBe(200);
    const levelsJson = await levelsRes.json();
    expect(levelsJson.version).toBe(3);
    expect(levelsJson.chapters.length).toBe(4);
    expect(levelsJson.levels.length).toBe(52);

    // 2. Fresh Launch -> Must boot into First-Load 3D Unravel Intro Animation!
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    const introBoot = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(introBoot.screen).toBe('intro');
    expect(introBoot.introActive).toBe(true);
    expect(introBoot.tutorialActive).toBe(true);
    expect(introBoot.onboardingCompleted).toBe(false);
    expect(introBoot.configSource).toBe('network');
    expect(introBoot.levelsCatalog.source).toBe('network');
    expect(introBoot.levelsCatalog.count).toBe(52);
    expect(introBoot.renderer.validationErrors).toEqual([]);
    await expect(page.locator('#overlay-intro')).toBeVisible();

    // At 1.5s (90 ticks) the logo & finished embroidery should still be held serenely intact!
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(90, true);
    });
    expect((await page.evaluate(() => window.__GAME_TEST__!.getState())).introActive).toBe(true);

    // Advance mid-unravel (~3.1s) so pearls are visibly gliding from hoop to board & capture screenshot
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(95, false);
    });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'intro-unravel.png') });

    // Let the calmer 3D unravel finish naturally (~5.3s total) -> transitions automatically into Guided Tutorial Level 1!
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(200, false);
    });
    const afterIntro = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterIntro.introActive).toBe(false);
    expect(afterIntro.screen).toBe('playing');
    expect(afterIntro.levelIndex).toBe(0);
    expect(afterIntro.totalPearls).toBe(14);
    expect(afterIntro.tutorialActive).toBe(true);
    expect(afterIntro.tutorialStep).toBe(0);
    expect(afterIntro.activeTooltipTitle).toBe('Match the active colors');
    expect(afterIntro.tiles.every((t) => t.unblocked), 'Level 1 Warm-Up must have 0 blockers').toBe(true);
    expect(afterIntro.tiles.every((t) => t.special === 'none'), 'Level 1 Warm-Up must have 0 specials').toBe(true);
    await expect(page.locator('#overlay-intro')).toBeHidden();
    await expect(page.locator('#tutorial-tooltip')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'tutorial-tooltip.png') });

    // 3. Play through Tutorial Level 1 -> Verify progressive tooltips (Steps 0 -> 1 -> 2) & Post-Level-1 Scoring Debrief!
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) {
        const cur = window.__GAME_TEST__!.getState();
        const t = cur.tiles.find((x) => x.alive && x.unblocked && cur.activeColors.includes(x.color));
        if (!t) break;
        window.__GAME_TEST__!.tapTile(t.index);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(4, true);
    });
    const midTut1 = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(midTut1.tutorialStep).toBe(1);
    expect(midTut1.activeTooltipTitle).toBe('Follow each arrow & tray');

    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        const cur = window.__GAME_TEST__!.getState();
        const t = cur.tiles.find((x) => x.alive && x.unblocked && cur.activeColors.includes(x.color));
        if (!t) break;
        window.__GAME_TEST__!.tapTile(t.index);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(4, true);
    });
    const midTut2 = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(midTut2.tutorialStep).toBe(2);
    expect(midTut2.activeTooltipTitle).toBe('Undo, Hint & Restart');

    // Finish Tutorial Level 1 -> Scoring & Stars Debrief must appear!
    await page.evaluate(async () => {
      for (let i = 0; i < 12; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const t =
          cur.tiles.find((x) => x.alive && x.unblocked && cur.activeColors.includes(x.color)) ??
          cur.tiles.find((x) => x.alive && x.unblocked);
        if (!t) break;
        window.__GAME_TEST__!.tapTile(t.index);
        await window.__GAME_TEST__!.stepTicks(24, true);
      }
      await window.__GAME_TEST__!.stepTicks(26, false);
    });
    const tutDone = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(tutDone.phase).toBe('complete');
    expect(tutDone.onboardingCompleted).toBe(true);
    expect(tutDone.gallery.completedCuratedIds).toContain(0);
    await expect(page.locator('#overlay-complete')).toBeVisible();
    await expect(page.locator('#complete-tutorial-guide')).toBeVisible();
    await expect(page.locator('#btn-next-level')).toHaveText('Continue to Level 2');
    await expect(page.locator('#btn-complete-menu')).toBeVisible();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'tutorial-scoring.png') });

    // Return to refined 4-Row Start Menu
    await page.locator('#btn-complete-menu').click();
    await expect(page.locator('#overlay-start-menu')).toBeVisible();

    // 4. Verify Refined 4-Row Start Menu Layout (NO campaign strip, Level Select at bottom, clean touch targets)
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
        '#btn-mode-daily-library',
        '#btn-mode-random',
        '#btn-mode-custom',
        '#btn-menu-gallery',
      ];
      const buttons = selectors.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        return {
          sel,
          top: rect?.top ?? 0,
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
      const yOf = (sel: string) => buttons.find((b) => b.sel === sel)?.top ?? 0;
      return {
        capable,
        viewport,
        noOverflowX: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        noOverflowY: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
        hasOldCampaignStrip: Boolean(document.querySelector('#menu-campaign-strip')),
        rowOrderValid:
          yOf('#btn-mode-journey') < yOf('#btn-mode-daily') &&
          yOf('#btn-mode-daily') < yOf('#btn-mode-random') &&
          yOf('#btn-mode-random') < yOf('#btn-menu-gallery'),
        dailySameRow: Math.abs(yOf('#btn-mode-daily') - yOf('#btn-mode-daily-library')) < 4,
        randomCustomSameRow: Math.abs(yOf('#btn-mode-random') - yOf('#btn-mode-custom')) < 4,
        buttons,
      };
    });

    expect(menuAudit.capable).toBe('yes');
    expect(menuAudit.viewport).toContain('viewport-fit=cover');
    expect(menuAudit.noOverflowX).toBe(true);
    expect(menuAudit.noOverflowY).toBe(true);
    expect(menuAudit.hasOldCampaignStrip).toBe(false);
    expect(menuAudit.rowOrderValid).toBe(true);
    expect(menuAudit.dailySameRow).toBe(true);
    expect(menuAudit.randomCustomSameRow).toBe(true);
    for (const btn of menuAudit.buttons) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
    }
    await expect(page.locator('#menu-journey-main')).toHaveText('Play Dewdrop Ring');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'start-menu.png') });

    // 5. Verify Spacious Settings Drawer (4 individual Special Pearl cards + Replay Tutorial + Haptics + Install Guide)
    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#overlay-settings')).toBeVisible();
    await expect(page.locator('.special-guide-card')).toHaveCount(4);
    await expect(page.locator('#btn-replay-tutorial')).toBeVisible();
    await expect(page.locator('#btn-test-haptic')).toBeVisible();
    await page.locator('#overlay-settings').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'settings-specials.png') });
    await page.locator('#overlay-settings').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.locator('[data-solar-preset="18.25"]').click();
    expect((await page.evaluate(() => window.__GAME_TEST__!.getState())).timeMode).toBe('manual');
    await page.locator('#btn-solar-auto').click();
    expect((await page.evaluate(() => window.__GAME_TEST__!.getState())).timeMode).toBe('auto');
    await page.locator('#btn-close-settings').click();
    await expect(page.locator('#overlay-settings')).toBeHidden();

    // 6. Verify Theme-Synced 1-Column Square Level Select with Miniature SVG Embroidery Previews & ZERO Endless/Seed clutter!
    await page.locator('#btn-menu-gallery').click();
    await expect(page.locator('#overlay-gallery')).toBeVisible();
    await expect(page.locator('#overlay-gallery')).toHaveAttribute('data-view-theme', '0');
    await expect(page.locator('#chapter-tabs .chapter-tab')).toHaveCount(4);
    await expect(page.locator('#gallery-grid .square-level-card')).toHaveCount(13);
    await expect(page.locator('#gallery-grid .embroidery-preview-svg')).toHaveCount(13);
    // Confirm Endless & Seed controls are completely removed from Level Select!
    await expect(page.locator('#overlay-gallery #seed-form')).toHaveCount(0);
    await expect(page.locator('#overlay-gallery #seed-diff-picker')).toHaveCount(0);

    // Confirm 1-column square proportions & sequential locking (Lvl 1 done, Lvl 2 unlocked/current, Lvl 3 locked)
    const cardGeom = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#gallery-grid .square-level-card')) as HTMLElement[];
      const r0 = cards[0]?.getBoundingClientRect();
      const r1 = cards[1]?.getBoundingClientRect();
      return {
        singleCol: Boolean(r0 && r1 && Math.abs(r0.left - r1.left) < 2 && r1.top > r0.bottom),
        aspectRatio: r0 ? r0.width / Math.max(1, r0.height) : 0,
      };
    });
    expect(cardGeom.singleCol).toBe(true);
    expect(cardGeom.aspectRatio).toBeGreaterThan(0.92);
    expect(cardGeom.aspectRatio).toBeLessThan(1.08);
    await expect(page.locator('#gallery-grid .square-level-card[data-level-index="0"]')).toHaveClass(/is-completed/);
    await expect(page.locator('#gallery-grid .square-level-card[data-level-index="1"]')).toHaveAttribute('data-locked', 'false');
    await expect(page.locator('#gallery-grid .square-level-card[data-level-index="2"]')).toHaveAttribute('data-locked', 'true');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'level-select-jewel.png') });

    // Switch Campaign tabs -> Verify sheet theme styling + live background sync!
    await page.locator('#chapter-tabs .chapter-tab[data-chapter-id="1"]').click();
    await expect(page.locator('#overlay-gallery')).toHaveAttribute('data-view-theme', '1');
    expect((await page.evaluate(() => window.__GAME_TEST__!.getState())).themeIndex).toBe(1);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'level-select-neon.png') });

    await page.locator('#chapter-tabs .chapter-tab[data-chapter-id="2"]').click();
    await expect(page.locator('#overlay-gallery')).toHaveAttribute('data-view-theme', '2');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'level-select-pop.png') });

    await page.locator('#chapter-tabs .chapter-tab[data-chapter-id="0"]').click();
    await page.locator('#btn-close-gallery').click();
    await expect(page.locator('#overlay-gallery')).toBeHidden();

    // 7. Verify Daily Stitch Completion -> Saved into Daily Library with Miniature SVG Preview + Replay!
    await page.locator('#btn-mode-daily').click();
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadDaily(20261125);
      await window.__GAME_TEST__!.stepTicks(3, true);
      for (let i = 0; i < 45; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const mv = window.__GAME_TEST__!.hint();
        if (mv < 0) break;
        window.__GAME_TEST__!.tapTile(mv);
        await window.__GAME_TEST__!.stepTicks(20, true);
      }
      await window.__GAME_TEST__!.stepTicks(24, true);
    });
    const dailySolved = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(dailySolved.phase).toBe('complete');
    expect(dailySolved.gallery.dailyHistoryCount).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => window.__GAME_TEST__!.openStartMenu());
    await page.locator('#btn-mode-daily-library').click();
    await expect(page.locator('#overlay-daily-library')).toBeVisible();
    await expect(page.locator('#daily-library-grid .square-level-card')).toHaveCount(1);
    await expect(page.locator('#daily-library-grid .embroidery-preview-svg')).toHaveCount(1);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'daily-library.png') });
    await page.locator('#btn-close-daily-library').click();

    // 8. Verify Dedicated Random Studio (Seed on top, Style picker, Difficulty picker, Completed Archive!)
    await page.locator('#btn-mode-random').click();
    await expect(page.locator('#overlay-random')).toBeVisible();
    await expect(page.locator('#random-style-picker .style-pill-btn')).toHaveCount(5);
    await expect(page.locator('#seed-diff-picker .seed-diff-pill')).toHaveCount(4);

    // Choose explicit Pop Art style (2) + Easy (5x5) + Seed 551234 -> solve -> verify appears in archive!
    await page.locator('#random-style-picker .style-pill-btn[data-random-style="2"]').click();
    await page.locator('#seed-diff-picker .seed-diff-pill[data-seed-difficulty="0"]').click();
    await page.locator('#input-custom-seed').fill('551234');
    await page.locator('#btn-play-seed').click();
    await expect(page.locator('#overlay-random')).toBeHidden();
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.stepTicks(3, true);
    });
    const randStart = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(randStart.mode).toBe('mandala');
    expect(randStart.themeIndex).toBe(2);
    expect(randStart.gridCols).toBe(5);
    expect(randStart.seed).toBe(551234);

    await page.evaluate(async () => {
      for (let i = 0; i < 32; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const mv = window.__GAME_TEST__!.hint();
        if (mv < 0) break;
        window.__GAME_TEST__!.tapTile(mv);
        await window.__GAME_TEST__!.stepTicks(20, true);
      }
      await window.__GAME_TEST__!.stepTicks(24, true);
    });
    await page.evaluate(() => window.__GAME_TEST__!.openStartMenu());
    await page.locator('#btn-mode-random').click();
    await expect(page.locator('#random-history-grid .square-level-card')).toHaveCount(1);
    await expect(page.locator('#random-history-grid .embroidery-preview-svg')).toHaveCount(1);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'random-studio.png') });
    await page.locator('#btn-close-random').click();

    // 9. Verify New Custom Mode Builder (Style, Width 5..8, Height 5..8, Colors 3..6, Special Pearl toggles)
    await page.locator('#btn-mode-custom').click();
    await expect(page.locator('#overlay-custom')).toBeVisible();
    await page.locator('#custom-style-picker .style-pill-btn[data-custom-theme="3"]').click();
    await page.locator('#custom-cols-picker .seg-btn[data-custom-cols="6"]').click();
    await page.locator('#custom-rows-picker .seg-btn[data-custom-rows="5"]').click();
    await page.locator('#custom-colors-picker .seg-btn[data-custom-colors="4"]').click();
    await expect(page.locator('#overlay-custom')).toHaveAttribute('data-view-theme', '3');
    await expect(page.locator('#custom-size-readout')).toHaveText('6 × 5');
    await page.screenshot({ path: path.join(RESULTS_DIR, 'custom-builder.png') });

    await page.locator('#btn-start-custom').click();
    await expect(page.locator('#overlay-custom')).toBeHidden();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3, true));
    const customSt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(customSt.mode).toBe('custom');
    expect(customSt.themeIndex).toBe(3);
    expect(customSt.gridCols).toBe(6);
    expect(customSt.gridRows).toBe(5);
    expect(customSt.renderer.validationErrors).toEqual([]);

    // Solve this Custom pattern and verify it is saved into Custom Mode's Completed Archive with SVG preview!
    await page.evaluate(async () => {
      for (let i = 0; i < 42; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete') break;
        const mv = window.__GAME_TEST__!.hint();
        if (mv < 0) break;
        window.__GAME_TEST__!.tapTile(mv);
        await window.__GAME_TEST__!.stepTicks(18, true);
      }
      await window.__GAME_TEST__!.stepTicks(24, true);
    });
    const customDone = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(customDone.phase).toBe('complete');
    expect(customDone.gallery.customHistoryCount).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => window.__GAME_TEST__!.openStartMenu());
    await page.locator('#btn-mode-custom').click();
    await expect(page.locator('#custom-history-grid .square-level-card')).toHaveCount(1);
    await expect(page.locator('#custom-history-grid .embroidery-preview-svg')).toHaveCount(1);
    await page.locator('#overlay-custom').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'custom-archive.png') });
    await page.locator('#btn-close-custom').click();

    // 10. Verify First-Encounter Special Pearl Tooltips
    await page.evaluate(async () => {
      window.__GAME_TEST__!.enterGame();
      // Load 8x8 finale (Level 12) which has Hidden & Locked pearls not yet encountered in Easy/Daily!
      window.__GAME_TEST__!.loadLevel(12);
      await window.__GAME_TEST__!.stepTicks(3, false);
    });
    const specialTipSt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(specialTipSt.activeTooltipTitle, 'First-encounter Special Pearl tooltip should appear').toBeTruthy();
    await page.screenshot({ path: path.join(RESULTS_DIR, 'special-tooltip.png') });
    await page.locator('#btn-tooltip-dismiss').click();

    // 11. Verify ALL 4 Worlds Visual Pop, Contrast & Saturation + Final-Color Victory Rush Mode
    const chapterSamples = [
      { level: 2, expectedTheme: 0, file: 'theme-0-jewel.png' },
      { level: 15, expectedTheme: 1, file: 'theme-1-neon.png' },
      { level: 28, expectedTheme: 2, file: 'theme-2-popart.png' },
      { level: 41, expectedTheme: 3, file: 'theme-3-prism.png' },
    ];
    const themeCaptures: Buffer[] = [];
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(12.5);
      await window.__GAME_TEST__!.stepTicks(2, true);
    });
    for (const sample of chapterSamples) {
      await page.evaluate(async (lvl) => {
        window.__GAME_TEST__!.loadLevel(lvl);
        await window.__GAME_TEST__!.stepTicks(3, false);
      }, sample.level);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.themeIndex).toBe(sample.expectedTheme);
      expect(st.renderer.validationErrors).toEqual([]);
      const buf = await page.screenshot({ path: path.join(RESULTS_DIR, sample.file) });
      themeCaptures.push(buf);
    }

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
    expect(jewelMetrics.p95Lum - jewelMetrics.p10Lum).toBeGreaterThan(0.35);
    expect(jewelMetrics.p95Sat).toBeGreaterThan(0.55);
    expect(neonMetrics.p10Lum).toBeLessThan(0.38);
    expect(neonMetrics.p95Sat).toBeGreaterThan(0.60);
    expect(popMetrics.p95Sat).toBeGreaterThan(0.65);
    expect(prismMetrics.p95Sat).toBeGreaterThan(0.55);

    // Final-Color Victory Rush Mode + Auto-Resolve Queue check on Level 3
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(2);
      await window.__GAME_TEST__!.stepTicks(3, true);
      for (let i = 0; i < 30; i++) {
        const cur = window.__GAME_TEST__!.getState();
        if (cur.phase === 'complete' || cur.finalColorMode) break;
        const mv = window.__GAME_TEST__!.hint();
        if (mv < 0) break;
        window.__GAME_TEST__!.tapTile(mv);
        await window.__GAME_TEST__!.stepTicks(16, true);
      }
      await window.__GAME_TEST__!.stepTicks(6, false);
    });
    const rushSt = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(rushSt.finalColorMode).toBe(true);
    expect(rushSt.audio.finalRushMode).toBe(true);
    await expect(page.locator('#swatch-caption')).toHaveText('FINISH');

    // 12. Reload -> Returning player must skip intro straight to Start Menu with all archives persisted!
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });
    const reloaded = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(reloaded.screen).toBe('menu');
    expect(reloaded.onboardingCompleted).toBe(true);
    expect(reloaded.gallery.completedCuratedIds).toContain(0);
    expect(reloaded.gallery.dailyHistoryCount).toBeGreaterThanOrEqual(1);
    expect(reloaded.gallery.randomHistoryCount).toBeGreaterThanOrEqual(1);
    expect(reloaded.gallery.customHistoryCount).toBeGreaterThanOrEqual(1);

    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `Page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(failedResponses, `Failed HTTP responses: ${failedResponses.join('\n')}`).toEqual([]);
  });
});
