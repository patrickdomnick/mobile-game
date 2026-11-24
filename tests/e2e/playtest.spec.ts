import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('Pearl Loom — iPhone 16 WebGPU Raytraced Autonomous E2E Playtest', () => {
  test('verifies PWA shell, HUD clarity, 24h solar raytracing, Hint/Undo/Blocked mechanics, full autonomous solve, and idle battery throttle', async ({
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

    // 1. Verify PWA manifest, icons & Service Worker endpoints (subpath-portable)
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.start_url).toBe('./');

    expect((await request.get('/sw.js')).status()).toBe(200);
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);

    // 2. Load Pearl Loom on localhost (secure context for WebGPU)
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify Safari standalone meta tags, zero overflow, and clear touch targets (>= 36px)
    const layoutAudit = await page.evaluate(() => {
      const capable = document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute('content');
      const viewport = document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute('content');
      const buttons = ['#btn-pattern', '#btn-undo', '#btn-hint', '#btn-reset'].map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        return {
          sel,
          text: el?.textContent?.trim() ?? '',
          aria: el?.getAttribute('aria-label') ?? '',
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          inBounds:
            rect != null &&
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
        buttons,
      };
    });

    expect(layoutAudit.capable).toBe('yes');
    expect(layoutAudit.viewport).toContain('viewport-fit=cover');
    expect(layoutAudit.noOverflowX).toBe(true);
    expect(layoutAudit.noOverflowY).toBe(true);
    for (const btn of layoutAudit.buttons) {
      expect(btn.inBounds, `${btn.sel} out of viewport`).toBe(true);
      expect(btn.height, `${btn.sel} touch target too short`).toBeGreaterThanOrEqual(36);
      expect(btn.text.length + btn.aria.length, `${btn.sel} missing clear label`).toBeGreaterThan(0);
    }

    // 3. Wait for WASM + WebGPU raytracer to finish first frame
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    // 4. Verify continuous 24h solar raytracing across Noon, Golden Hour, and Candlelit Night
    const captureSolar = async (hours: number, filename: string): Promise<Buffer> => {
      await page.evaluate(async (h) => {
        window.__GAME_TEST__!.setTimeOfDayOverride(h);
        await window.__GAME_TEST__!.stepTicks(4);
      }, hours);
      const st = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(st.renderer.validationErrors).toEqual([]);
      const buf = await page.screenshot({ path: path.join(RESULTS_DIR, filename) });
      expect(buf.byteLength).toBeGreaterThan(8_000);
      return buf;
    };

    const noonPng = await captureSolar(12.5, 'solar-noon.png');
    const goldenPng = await captureSolar(18.1, 'solar-golden.png');
    const nightPng = await captureSolar(23.0, 'solar-night.png');

    // Confirm solar lighting visibly transforms the atelier scene
    expect(Buffer.compare(noonPng, goldenPng)).not.toBe(0);
    expect(Buffer.compare(noonPng, nightPng)).not.toBe(0);
    expect(Buffer.compare(goldenPng, nightPng)).not.toBe(0);

    // Return to sunlit morning (10.5h) for main playthrough inspection
    await page.evaluate(async () => {
      window.__GAME_TEST__!.setTimeOfDayOverride(10.5);
      window.__GAME_TEST__!.loadLevel(1); // Sakura Blossom (4x4) to test blocked tap + undo
      await window.__GAME_TEST__!.stepTicks(4);
    });

    // 5. Test Blocked Tile gentle wobble (zero penalty) via REAL canvas tap
    const level1State = await page.evaluate(() => window.__GAME_TEST__!.getState());
    const blockedTile = level1State.tiles.find((t) => t.alive && !t.unblocked);
    if (blockedTile) {
      const prevBlocked = level1State.events.blockedEvents;
      await page.mouse.click(blockedTile.screenX * 393, blockedTile.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(3));
      const afterBlocked = await page.evaluate(() => window.__GAME_TEST__!.getState());
      expect(afterBlocked.events.blockedEvents).toBeGreaterThan(prevBlocked);
      expect(afterBlocked.tiles[blockedTile.index].alive).toBe(true);
    }

    // 6. Test Hint button + real tap + Undo button restoration
    await page.locator('#btn-hint').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(4));
    const hintedState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(hintedState.hintTileIndex).toBeGreaterThanOrEqual(0);
    const hintedTile = hintedState.tiles[hintedState.hintTileIndex];
    expect(hintedTile.unblocked).toBe(true);

    // Capture mid-puzzle hint glow screenshot on 4x4 Sakura Blossom
    await page.screenshot({ path: path.join(RESULTS_DIR, 'sakura-hint.png') });

    // Real pointer tap on the hinted tile's screen position
    await page.mouse.click(hintedTile.screenX * 393, hintedTile.screenY * 852);
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(30));
    const afterTap = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterTap.moves).toBe(1);
    expect(afterTap.tiles[hintedTile.index].alive).toBe(false);
    expect(afterTap.undoDepth).toBe(1);

    // Click Undo button and verify clean restoration
    await page.locator('#btn-undo').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(4));
    const afterUndo = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(afterUndo.moves).toBe(0);
    expect(afterUndo.tiles[hintedTile.index].alive).toBe(true);

    // 7. Autonomously solve Level 0 ("Rose Heart") end-to-end via real canvas pointer taps!
    await page.evaluate(async () => {
      window.__GAME_TEST__!.loadLevel(0);
      await window.__GAME_TEST__!.stepTicks(4);
    });

    for (let move = 0; move < 16; move++) {
      const cur = await page.evaluate(() => window.__GAME_TEST__!.getState());
      if (cur.phase === 'complete') break;
      const hintIdx = await page.evaluate(() => window.__GAME_TEST__!.hint());
      expect(hintIdx).toBeGreaterThanOrEqual(0);
      const targetTile = cur.tiles[hintIdx];
      await page.mouse.click(targetTile.screenX * 393, targetTile.screenY * 852);
      await page.evaluate(() => window.__GAME_TEST__!.stepTicks(28));
    }

    // Let completion shimmer settle so complete modal displays cleanly
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(130));
    const completedState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(completedState.phase).toBe('complete');
    expect(completedState.stitchedCount).toBe(completedState.totalPearls);
    expect(completedState.trayColors).toEqual([]);
    await expect(page.locator('#overlay-complete')).toBeVisible();
    await expect(page.locator('#complete-title')).toHaveText('Rose Heart');

    await page.screenshot({ path: path.join(RESULTS_DIR, 'completed-heart.png') });

    // Click Next Pattern button and confirm transition to Sakura Blossom
    await page.locator('#btn-next-level').click();
    await page.evaluate(() => window.__GAME_TEST__!.stepTicks(6));
    const nextState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(nextState.levelIndex).toBe(1);
    expect(nextState.levelName).toBe('Sakura Blossom');
    expect(nextState.phase).toBe('playing');

    // 8. Verify battery-saving idle throttling engages once animations settle
    await page.waitForTimeout(350);
    const idleState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(idleState.isAnimating).toBe(false);
    expect(idleState.renderer.isIdleThrottled).toBe(true);

    // 9. Final strict zero-error assertion
    expect(idleState.renderer.validationErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
