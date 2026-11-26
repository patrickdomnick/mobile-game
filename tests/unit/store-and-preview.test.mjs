import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Allow Node 22 native TypeScript runner to resolve Vite-style extensionless relative .ts imports
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsPath = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(tsPath)) {
        return { url: pathToFileURL(tsPath).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// Minimal in-memory localStorage mock for pure Node unit tests
function installMemoryStorage() {
  const map = new Map();
  globalThis.localStorage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    key(i) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
  };
  return map;
}

const { parseSeedInput, getDailyThemeForDateKey, SPECIAL_MASK } = await import('../../src/wasmBridge.ts');
const { renderEmbroideryPreviewSvg } = await import('../../src/preview.ts');
const { EmbroideryGalleryStore } = await import('../../src/gallery.ts');

test('parseSeedInput parses numeric seeds deterministically and hashes words cleanly', () => {
  assert.equal(parseSeedInput('20261125'), 20261125);
  assert.equal(parseSeedInput('  424242  '), 424242);
  const hashA = parseSeedInput('emerald-lotus');
  const hashB = parseSeedInput('  emerald-lotus  ');
  const hashOther = parseSeedInput('sunbeam-brooch');
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashOther);
  assert.ok(hashA > 0 && Number.isInteger(hashA));
});

test('getDailyThemeForDateKey rotates deterministically across all 4 visual themes', () => {
  const seen = new Set();
  for (let d = 0; d < 28; d++) {
    const theme = getDailyThemeForDateKey(20261101 + d);
    assert.ok(theme.id >= 0 && theme.id <= 3);
    assert.ok(theme.name.length > 0);
    seen.add(theme.id);
  }
  assert.equal(seen.size, 4, 'expected all 4 visual themes across 28 daily keys');
});

test('renderEmbroideryPreviewSvg produces crisp theme-matched SVG for unlocked and locked previews', () => {
  const stitches = [
    [0, 0, 0],
    [0.45, -0.35, 1],
    [-0.45, 0.35, 2],
  ];
  for (let theme = 0; theme < 4; theme++) {
    const unlockedSvg = renderEmbroideryPreviewSvg(stitches, theme, { locked: false, size: 196 });
    assert.ok(unlockedSvg.startsWith('<svg '), `theme ${theme} should render <svg>`);
    assert.ok(unlockedSvg.includes('embroidery-preview-svg'));
    assert.ok(unlockedSvg.includes('<circle '), `theme ${theme} should render pearl circles`);

    const lockedSvg = renderEmbroideryPreviewSvg(stitches, theme, { locked: true, size: 196 });
    assert.ok(lockedSvg.includes('embroidery-preview-svg is-locked'));
    assert.ok(lockedSvg.includes('opacity="0.62"'));
  }
});

test('EmbroideryGalleryStore tracks sequential unlocks, onboarding, specials, and all 3 mode archives', () => {
  installMemoryStorage();
  const store = new EmbroideryGalleryStore();

  assert.equal(store.isOnboardingCompleted(), false);
  store.markOnboardingCompleted();
  assert.equal(store.isOnboardingCompleted(), true);

  assert.equal(store.hasSeenSpecial('heart'), false);
  store.markSpecialSeen('heart');
  assert.equal(store.hasSeenSpecial('heart'), true);

  // Sequential campaign unlocking: Level 0 unlocked, Level 1 locked until Level 0 completed
  const levelIds = [0, 1, 2];
  assert.equal(store.isLevelUnlocked(0, levelIds), true);
  assert.equal(store.isLevelUnlocked(1, levelIds), false);
  store.recordCompletion('curated', 0, 3200, 3, 7);
  assert.equal(store.isLevelUnlocked(1, levelIds), true);
  assert.equal(store.isLevelUnlocked(2, levelIds), false);

  // Daily, Random, and Custom archive persistence with SVG stitches
  const sampleStitches = [
    [0, 0, 0],
    [0.5, 0.2, 1],
  ];
  store.recordCompletion('daily', 20261125, 4100, 3, 8, {
    seed: 20261125,
    theme: 1,
    grid: '6×6',
    pearls: 28,
    stitches: sampleStitches,
  });
  store.recordCompletion('mandala', 551234, 2900, 2, 5, {
    seed: 551234,
    theme: 2,
    difficulty: 0,
    grid: '5×5',
    pearls: 20,
    stitches: sampleStitches,
  });
  store.recordCompletion('custom', 777111, 5100, 3, 9, {
    seed: 777111,
    theme: 3,
    cols: 6,
    rows: 5,
    colorCount: 4,
    specialMask: SPECIAL_MASK.HEART | SPECIAL_MASK.RAINBOW,
    grid: '6×5',
    pearls: 26,
    stitches: sampleStitches,
  });

  // Rehydrate from localStorage into a fresh store instance
  const reloaded = new EmbroideryGalleryStore();
  assert.equal(reloaded.isOnboardingCompleted(), true);
  assert.equal(reloaded.hasSeenSpecial('heart'), true);
  assert.equal(reloaded.getDailyHistory().length, 1);
  assert.equal(reloaded.getRandomHistory().length, 1);
  assert.equal(reloaded.getCustomHistory().length, 1);
  assert.equal(reloaded.getCustomHistory()[0].seed, 777111);
  assert.equal(reloaded.getCustomHistory()[0].cols, 6);
  assert.equal(reloaded.getCustomHistory()[0].rows, 5);
});
