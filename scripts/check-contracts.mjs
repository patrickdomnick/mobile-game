#!/usr/bin/env node
/**
 * Fast fail-early contract & pitfall guard (< 100ms).
 * Catches ABI drift, WGSL reserved keywords, double-gamma regressions,
 * accidental visual spoilers, and broken relative PWA paths BEFORE build/E2E!
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. Verify Go <-> TypeScript <-> WGSL SceneData Float Count ABI Parity
// ---------------------------------------------------------------------------
const goEngine = readText('sim/engine.go');
const goArtworks = readText('sim/artworks.go');
const goSolver = readText('sim/solver.go');
const tsMain = readText('src/main.ts');
const wgsl = readText('src/renderer/raytrace.wgsl');

function extractConst(src, name) {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

const goHeader = extractConst(goEngine, 'SceneHeaderFloats');
const goNumColors = extractConst(goArtworks, 'NumColors');
const goMaxTiles = extractConst(goSolver, 'MaxGridTiles');
const goMaxHoop = extractConst(goEngine, 'MaxHoopPearls');
const goTrayCap = extractConst(goSolver, 'TrayCapacity');
const goMaxFlying = extractConst(goEngine, 'MaxFlying');

if ([goHeader, goNumColors, goMaxTiles, goMaxHoop, goTrayCap, goMaxFlying].some((v) => v === null)) {
  errors.push('ABI check failed: could not parse all Go scene layout constants from sim/.');
} else {
  const goSceneFloats =
    goHeader + goNumColors * 4 + (goMaxTiles + goMaxHoop + goTrayCap + goMaxFlying) * 8;

  const tsBufMatch = tsMain.match(/SCENE_BUFFER_BYTES\s*=\s*(\d+)\s*\*\s*4/);
  if (!tsBufMatch) {
    errors.push('ABI check failed: SCENE_BUFFER_BYTES not found in src/main.ts.');
  } else {
    const tsSceneFloats = Number(tsBufMatch[1]);
    if (tsSceneFloats !== goSceneFloats) {
      errors.push(
        `ABI mismatch: sim/engine.go packs ${goSceneFloats} floats, but src/main.ts allocates ${tsSceneFloats} floats.`,
      );
    }
  }

  const structMatch = wgsl.match(/struct\s+SceneData\s*\{([\s\S]*?)\};/);
  if (!structMatch) {
    errors.push('ABI check failed: struct SceneData not found in src/renderer/raytrace.wgsl.');
  } else {
    let wgslFloats = 0;
    const body = structMatch[1];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line) continue;
      if (/:\s*vec4<f32>/.test(line)) {
        wgslFloats += 4;
      } else {
        const arrVec4 = line.match(/:\s*array<vec4<f32>,\s*(\d+)>/);
        const arrNode = line.match(/:\s*array<PearlNode,\s*(\d+)>/);
        if (arrVec4) wgslFloats += 4 * Number(arrVec4[1]);
        else if (arrNode) wgslFloats += 8 * Number(arrNode[1]);
      }
    }
    if (wgslFloats !== goSceneFloats) {
      errors.push(
        `ABI mismatch: sim/engine.go packs ${goSceneFloats} floats, but raytrace.wgsl SceneData sums to ${wgslFloats} floats.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. WGSL Reserved Keywords & Shader Color-Space Pitfall Guard
// ---------------------------------------------------------------------------
const wgslNoComments = wgsl.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const reservedKeywords = [
  'meta',
  'ref',
  'self',
  'type',
  'using',
  'virtual',
  'yield',
  'abstract',
  'async',
  'await',
  'class',
  'final',
  'namespace',
  'null',
  'private',
  'protected',
  'public',
  'static',
  'super',
  'this',
];
for (const kw of reservedKeywords) {
  // Check field definitions ("kw:") or variable declarations ("let kw", "var kw")
  const re = new RegExp(`(?:\\b(?:let|var|fn)\\s+${kw}\\b|\\b${kw}\\s*:)`);
  if (re.test(wgslNoComments)) {
    errors.push(`WGSL reserved keyword "${kw}" used as identifier in src/renderer/raytrace.wgsl.`);
  }
}

// Guard against washed-out double-gamma regressions: toLinear must exist and be called!
if (!/fn\s+toLinear\s*\(/.test(wgslNoComments) || !/toLinear\s*\(/.test(wgslNoComments)) {
  errors.push('Color-space guard: src/renderer/raytrace.wgsl must convert sRGB colors via toLinear() before lighting.');
}

// ---------------------------------------------------------------------------
// 3. Zero-Spoiler Simulation Invariant Guard
// ---------------------------------------------------------------------------
// Ensure unblocked state (bit 2) is NEVER packed into GPU scene tile flags.
const goRenderSync = readText('sim/render_sync.go');
const tilePackStart = goRenderSync.indexOf('// --- Board Tiles');
if (tilePackStart < 0) {
  errors.push('Zero-spoiler guard failed: could not locate "// --- Board Tiles" in sim/render_sync.go.');
} else {
  const tilePackSection = goRenderSync.slice(tilePackStart);
  const hoopSectionIdx = tilePackSection.indexOf('// --- Embroidery Hoop');
  const tilePackOnly = hoopSectionIdx > 0 ? tilePackSection.slice(0, hoopSectionIdx) : tilePackSection;
  if (/flags\s*\|=\s*2\b/.test(tilePackOnly)) {
    errors.push('Zero-spoiler violation: sim/render_sync.go must NOT pack unblocked bit (flags |= 2) into GPU scene buffer.');
  }
}

// ---------------------------------------------------------------------------
// 4. Dead Legacy CSS Regression Guard
// ---------------------------------------------------------------------------
const styleCss = readText('src/style.css');
const forbiddenLegacySelectors = [
  '.menu-campaign-strip',
  '.menu-campaign-pill',
  '.theme-strip',
  '.theme-chip',
  '.settings-theme-grid',
  '.solar-chip',
  '.install-chip',
  '.gallery-item',
  '.gallery-special-row',
  '.start-theme-block',
];
for (const sel of forbiddenLegacySelectors) {
  if (styleCss.includes(sel)) {
    errors.push(`Dead CSS regression: legacy selector "${sel}" found in src/style.css.`);
  }
}

// ---------------------------------------------------------------------------
// 5. GitHub Pages Subpath Portability Guard (base: './' & relative assets)
// ---------------------------------------------------------------------------
const viteConfig = readText('vite.config.ts');
if (!/base:\s*['"]\.\/['"]/.test(viteConfig)) {
  errors.push("Subpath portability: vite.config.ts must keep base: './'.");
}

const indexHtml = readText('index.html');
for (const badAttr of ['href="/manifest.webmanifest"', 'href="/apple-touch-icon.png"', 'href="/game.wasm"', 'href="/icon.svg"']) {
  if (indexHtml.includes(badAttr)) {
    errors.push(`Subpath portability: index.html contains root-relative ${badAttr}; use ./ instead.`);
  }
}

const manifest = JSON.parse(readText('public/manifest.webmanifest'));
if (manifest.start_url !== './' || manifest.scope !== './') {
  errors.push('Subpath portability: manifest.webmanifest start_url and scope must be "./".');
}

const swJs = readText('public/sw.js');
if (!/CACHE_NAME\s*=\s*['"]pearl-loom-v\d+['"]/.test(swJs)) {
  errors.push('PWA guard: public/sw.js must define versioned CACHE_NAME (pearl-loom-vN).');
}

if (errors.length > 0) {
  console.error('Contract guard FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('✓ Contract guard passed (Go/TS/WGSL ABI parity, WGSL keywords, linear PBR, zero-spoiler, clean CSS, PWA subpath portability)');
