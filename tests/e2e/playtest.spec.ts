import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), 'test-results');

test.describe('iPhone 16 WebGPU Raytraced WASM Game — Autonomous E2E Playtest', () => {
  test('boots cleanly as standalone PWA, renders WebGPU raytracing, and completes autonomous playtest', async ({
    page,
    request,
  }) => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    // 1. Verify PWA manifest & Service Worker endpoints
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');

    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);

    // 2. Load game on localhost (secure context for WebGPU)
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify Safari standalone PWA meta tags & zero-scroll single-screen layout
    const pwaMeta = await page.evaluate(() => {
      const capable = document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute('content');
      const viewport = document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute('content');
      return {
        capable,
        viewport,
        noOverflowX: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        noOverflowY: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      };
    });
    expect(pwaMeta.capable).toBe('yes');
    expect(pwaMeta.viewport).toContain('viewport-fit=cover');
    expect(pwaMeta.noOverflowX).toBe(true);
    expect(pwaMeta.noOverflowY).toBe(true);

    // 3. Wait for WASM + WebGPU raytracer to finish first frame
    await page.waitForFunction(() => Boolean(window.__GAME_TEST__), undefined, { timeout: 15_000 });
    await page.evaluate(async () => {
      await window.__GAME_TEST__!.ready();
    });

    const initialState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(initialState.ready).toBe(true);
    expect(initialState.renderer.backend).toBe('webgpu');
    expect(initialState.renderer.width).toBeGreaterThan(200);
    expect(initialState.renderer.height).toBeGreaterThan(400);
    expect(initialState.renderer.validationErrors).toEqual([]);

    // Capture initial raytraced frame for visual verification
    const initialScreenshotPath = path.join(RESULTS_DIR, 'initial-frame.png');
    const initialPng = await page.screenshot({ path: initialScreenshotPath });
    expect(initialPng.byteLength).toBeGreaterThan(5_000);

    // 4. Autonomous AI Playtest: steer player orb toward collectible gem until score >= 1
    const startPlayer = initialState.player;
    const startTarget = initialState.target;

    await page.evaluate(async () => {
      const api = window.__GAME_TEST__!;
      for (let attempt = 0; attempt < 18; attempt++) {
        const s = api.getState();
        if (s.score >= 1) break;
        const maxX = Math.max(0.1, s.arenaHalfW - 0.45);
        const maxZ = Math.max(0.1, s.arenaHalfD - 0.45);
        const nx = Math.max(-1, Math.min(1, s.target.x / maxX));
        const nz = Math.max(-1, Math.min(1, s.target.z / maxZ));
        api.setPointerNormalized(nx, nz, true);
        await api.stepTicks(10);
      }
      api.setPointerNormalized(0, 0, false);
      await api.stepTicks(2);
    });

    const playedState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(playedState.score).toBeGreaterThanOrEqual(1);
    expect(
      Math.hypot(playedState.player.x - startPlayer.x, playedState.player.z - startPlayer.z),
    ).toBeGreaterThan(0.5);
    expect(
      playedState.target.x !== startTarget.x || playedState.target.z !== startTarget.z,
    ).toBe(true);
    expect(playedState.renderer.validationErrors).toEqual([]);

    // Verify HUD reflects new score
    await expect(page.locator('#hud-score')).toHaveText(String(playedState.score));

    // Capture post-playtest frame and confirm visual frame actually changed
    const playedScreenshotPath = path.join(RESULTS_DIR, 'after-playtest.png');
    const playedPng = await page.screenshot({ path: playedScreenshotPath });
    expect(playedPng.byteLength).toBeGreaterThan(5_000);
    expect(Buffer.compare(initialPng, playedPng)).not.toBe(0);

    // 5. Verify Reset UI resets simulation cleanly
    await page.locator('#btn-reset').click();
    await expect(page.locator('#hud-score')).toHaveText('0');
    const resetState = await page.evaluate(() => window.__GAME_TEST__!.getState());
    expect(resetState.score).toBe(0);

    // 6. Final strict zero-error assertion
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
