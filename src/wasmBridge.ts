import { projectWorldToScreen } from './camera';

export type GameMode = 'curated' | 'mandala' | 'daily';
export type GamePhase = 'playing' | 'tray_full' | 'complete';

export const HINT_NEEDS_UNDO = -2;

export interface PearlColorInfo {
  name: string;
  hiHex: string;
  hex: string;
  loHex: string;
}

export interface VisualThemeDef {
  id: number;
  name: string;
  shortName: string;
  tagline: string;
  swatchGradient: string;
  accent: string;
  colors: readonly PearlColorInfo[];
}

// ACES-calibrated miniature 3D pearl stops matching sim/artworks.go ThemePalettes + raytrace.wgsl 1-to-1!
export const VISUAL_THEMES: readonly VisualThemeDef[] = [
  {
    id: 0,
    name: 'Jewel Atelier',
    shortName: 'Jewel',
    tagline: 'Sunlit gemstones on slate-walnut',
    swatchGradient: 'linear-gradient(135deg, #ed263e, #eee120, #268fed)',
    accent: '#f5a623',
    colors: [
      { name: 'Scarlet Ruby', hiHex: '#f3babe', hex: '#ed263e', loHex: '#c80814' },
      { name: 'Royal Cobalt', hiHex: '#bad0f3', hex: '#268fed', loHex: '#0846ca' },
      { name: 'Emerald Jade', hiHex: '#b8eecd', hex: '#20e380', loHex: '#04b33a' },
      { name: 'Sunbeam Gold', hiHex: '#f4edb8', hex: '#eee120', loHex: '#ccaf04' },
      { name: 'Vivid Amethyst', hiHex: '#e5bef3', hex: '#cf3eed', loHex: '#8f14ca' },
      { name: 'Aqua Cyan', hiHex: '#b8f0f2', hex: '#1ee7ec', loHex: '#02bcc6' },
    ],
  },
  {
    id: 1,
    name: 'Cyber Arcade',
    shortName: 'Neon',
    tagline: 'Electric synthwave grid & glowing orbs',
    swatchGradient: 'linear-gradient(135deg, #ed26c2, #1ee9ed, #a6ed26)',
    accent: '#0aebff',
    colors: [
      { name: 'Hot Magenta', hiHex: '#f4bae1', hex: '#ed26c2', loHex: '#c80779' },
      { name: 'Electric Cyan', hiHex: '#b8f2f4', hex: '#1ee9ed', loHex: '#02bec8' },
      { name: 'Acid Lime', hiHex: '#d8f4ba', hex: '#a6ed26', loHex: '#58c807' },
      { name: 'Laser Amber', hiHex: '#f4e6b8', hex: '#edd01e', loHex: '#c88d02' },
      { name: 'Ultraviolet', hiHex: '#e2c0f4', hex: '#c644ed', loHex: '#7e16c8' },
      { name: 'Flame Red', hiHex: '#f4c0bb', hex: '#ed442a', loHex: '#c8160a' },
    ],
  },
  {
    id: 2,
    name: 'Pop Studio',
    shortName: 'Pop Art',
    tagline: 'Bold comic ink & vivid primaries',
    swatchGradient: 'linear-gradient(135deg, #e9292e, #eae21e, #257ce9)',
    accent: '#ffd60a',
    colors: [
      { name: 'Pop Red', hiHex: '#ee797c', hex: '#e9292e', loHex: '#d40c0f' },
      { name: 'Royal Blue', hiHex: '#77a9ee', hex: '#257ce9', loHex: '#094ad4' },
      { name: 'Pop Green', hiHex: '#73e7b6', hex: '#20df91', loHex: '#04c25e' },
      { name: 'Comic Yellow', hiHex: '#efe972', hex: '#eae21e', loHex: '#d6c702' },
      { name: 'Hot Magenta', hiHex: '#ee7fe1', hex: '#e833d7', loHex: '#d213b5' },
      { name: 'Vivid Orange', hiHex: '#efbd72', hex: '#ea9e1e', loHex: '#d66b02' },
    ],
  },
  {
    id: 3,
    name: 'Cathedral Glass',
    shortName: 'Prism',
    tagline: 'Glowing stained-glass prisms & caustics',
    swatchGradient: 'linear-gradient(135deg, #eb2652, #ce43eb, #2aaaeb)',
    accent: '#d99bff',
    colors: [
      { name: 'Crimson Rose', hiHex: '#f3bac3', hex: '#eb2652', loHex: '#c80820' },
      { name: 'Cathedral Sapphire', hiHex: '#bbd9f3', hex: '#2aaaeb', loHex: '#0a64ca' },
      { name: 'Viridian Emerald', hiHex: '#b8efd8', hex: '#20e3a4', loHex: '#04b95e' },
      { name: 'Sun Gold', hiHex: '#f4ecb8', hex: '#ecdd20', loHex: '#ccac04' },
      { name: 'Royal Violet', hiHex: '#e6c0f3', hex: '#ce43eb', loHex: '#9318ca' },
      { name: 'Pearl White', hiHex: '#f2f3f4', hex: '#e9ebec', loHex: '#c6c9cc' },
    ],
  },
] as const;

export interface ChapterDef {
  id: number;
  roman: string;
  name: string;
  shortName: string;
  themeId: number;
  subtitle: string;
  startIndex: number;
  count: number;
}

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 0, roman: 'I', name: 'Jewel Atelier', shortName: 'Jewel', themeId: 0, subtitle: 'Sunlit gemstones & artisan brooches', startIndex: 0, count: 8 },
  { id: 1, roman: 'II', name: 'Cyber Arcade', shortName: 'Neon', themeId: 1, subtitle: 'Electric synthwave grids & pulses', startIndex: 8, count: 8 },
  { id: 2, roman: 'III', name: 'Pop Studio', shortName: 'Pop', themeId: 2, subtitle: 'Bold Warhol primaries & comic ink', startIndex: 16, count: 8 },
  { id: 3, roman: 'IV', name: 'Cathedral Glass', shortName: 'Prism', themeId: 3, subtitle: 'Grand rose windows & glowing caustics', startIndex: 24, count: 8 },
] as const;

export function getThemePalette(themeIndex: number): readonly PearlColorInfo[] {
  return (VISUAL_THEMES[themeIndex] ?? VISUAL_THEMES[0]).colors;
}

/** Matches sim.ThemeForDaily(dateKey) deterministically for UI badges. */
export function getDailyThemeForDateKey(dateKey: number): VisualThemeDef {
  let h = ((dateKey >>> 0) ^ 0x5a17c3d1) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return VISUAL_THEMES[h % VISUAL_THEMES.length] ?? VISUAL_THEMES[0];
}

/** Parses any numeric seed (e.g. "20261125", "482913") or text phrase (hashed via FNV-1a) into a non-zero uint32 seed. */
export function parseSeedInput(raw: string): number {
  const cleaned = raw.trim().replace(/^#/, '');
  if (!cleaned) return generateRandomSeed();
  if (/^\d+$/.test(cleaned)) {
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) {
      return (parsed >>> 0) || 1;
    }
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < cleaned.length; i++) {
    h ^= cleaned.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) || 1;
}

/** Generates a clean random 6-digit procedural seed (100000..999999). */
export function generateRandomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 100000 + (buf[0] % 900000);
}

export interface CuratedLevelDef {
  id: number;
  chapter: number;
  theme: number;
  name: string;
  grid: string;
  pearls: number;
  colors: readonly number[];
}

export const CURATED_LEVELS: readonly CuratedLevelDef[] = [
  // Chapter 0: Jewel Atelier (Theme 0)
  { id: 0, chapter: 0, theme: 0, name: 'Jewel Heart', grid: '5×5', pearls: 21, colors: [0, 3, 4, 5] },
  { id: 1, chapter: 0, theme: 0, name: 'Sakura Mandala', grid: '5×5', pearls: 25, colors: [0, 2, 3, 4] },
  { id: 2, chapter: 0, theme: 0, name: 'Royal Crown', grid: '6×5', pearls: 28, colors: [0, 1, 2, 3, 4] },
  { id: 3, chapter: 0, theme: 0, name: 'Emerald Clover', grid: '6×5', pearls: 29, colors: [1, 2, 3, 5] },
  { id: 4, chapter: 0, theme: 0, name: 'Royal Lotus', grid: '6×6', pearls: 33, colors: [0, 2, 3, 4, 5] },
  { id: 5, chapter: 0, theme: 0, name: 'Monarch Wing', grid: '6×6', pearls: 32, colors: [0, 1, 3, 4, 5] },
  { id: 6, chapter: 0, theme: 0, name: 'Nautilus Prism', grid: '6×6', pearls: 36, colors: [0, 1, 2, 3, 4, 5] },
  { id: 7, chapter: 0, theme: 0, name: 'Grand Starlight', grid: '7×6', pearls: 41, colors: [0, 1, 2, 3, 4, 5] },

  // Chapter 1: Cyber Arcade (Theme 1)
  { id: 8, chapter: 1, theme: 1, name: 'Neon Pulse', grid: '5×5', pearls: 24, colors: [0, 1, 2, 3, 4] },
  { id: 9, chapter: 1, theme: 1, name: 'Pixel Invader', grid: '6×5', pearls: 26, colors: [0, 1, 2, 3] },
  { id: 10, chapter: 1, theme: 1, name: 'Synth Horizon', grid: '6×5', pearls: 28, colors: [0, 1, 2, 3, 4, 5] },
  { id: 11, chapter: 1, theme: 1, name: 'Laser Grid', grid: '6×5', pearls: 30, colors: [0, 1, 2, 3, 4] },
  { id: 12, chapter: 1, theme: 1, name: 'Cyber Circuit', grid: '6×6', pearls: 32, colors: [0, 1, 2, 4, 5] },
  { id: 13, chapter: 1, theme: 1, name: 'Hyper Portal', grid: '6×6', pearls: 34, colors: [0, 1, 2, 3, 4] },
  { id: 14, chapter: 1, theme: 1, name: 'Plasma Bolt', grid: '6×6', pearls: 36, colors: [0, 1, 3] },
  { id: 15, chapter: 1, theme: 1, name: 'Matrix Core', grid: '7×6', pearls: 38, colors: [0, 1, 2, 4, 5] },

  // Chapter 2: Pop Studio (Theme 2)
  { id: 16, chapter: 2, theme: 2, name: 'Comic Star', grid: '5×5', pearls: 24, colors: [0, 1, 3, 4] },
  { id: 17, chapter: 2, theme: 2, name: 'Pop Heart', grid: '6×5', pearls: 26, colors: [0, 1, 2, 3, 4, 5] },
  { id: 18, chapter: 2, theme: 2, name: 'Halftone Bolt', grid: '6×5', pearls: 28, colors: [0, 1, 3, 5] },
  { id: 19, chapter: 2, theme: 2, name: 'Warhol Flower', grid: '6×5', pearls: 30, colors: [0, 1, 2, 3, 4, 5] },
  { id: 20, chapter: 2, theme: 2, name: 'Boom Burst', grid: '6×6', pearls: 32, colors: [0, 1, 3, 4] },
  { id: 21, chapter: 2, theme: 2, name: 'Retro Sun', grid: '6×6', pearls: 34, colors: [0, 1, 3, 4, 5] },
  { id: 22, chapter: 2, theme: 2, name: 'Pop Diamond', grid: '6×6', pearls: 36, colors: [0, 1, 2, 3, 4, 5] },
  { id: 23, chapter: 2, theme: 2, name: 'Studio Crown', grid: '7×6', pearls: 38, colors: [0, 1, 2, 3] },

  // Chapter 3: Cathedral Glass (Theme 3)
  { id: 24, chapter: 3, theme: 3, name: 'Prism Lantern', grid: '6×5', pearls: 28, colors: [0, 1, 2, 3, 4, 5] },
  { id: 25, chapter: 3, theme: 3, name: 'Sapphire Chalice', grid: '6×5', pearls: 30, colors: [0, 1, 3, 4, 5] },
  { id: 26, chapter: 3, theme: 3, name: 'Gothic Arch', grid: '6×6', pearls: 32, colors: [0, 1, 2, 3, 4, 5] },
  { id: 27, chapter: 3, theme: 3, name: 'Angel Wings', grid: '6×6', pearls: 34, colors: [1, 3, 4, 5] },
  { id: 28, chapter: 3, theme: 3, name: 'Cathedral Cross', grid: '6×6', pearls: 36, colors: [0, 1, 2, 3, 4, 5] },
  { id: 29, chapter: 3, theme: 3, name: 'Aurora Spire', grid: '7×6', pearls: 38, colors: [0, 1, 2, 3, 4, 5] },
  { id: 30, chapter: 3, theme: 3, name: 'Rose Window', grid: '7×6', pearls: 42, colors: [0, 1, 2, 3, 4, 5] },
  { id: 31, chapter: 3, theme: 3, name: 'Celestial Vault', grid: '7×7', pearls: 45, colors: [0, 1, 2, 3, 4, 5] },
] as const;

export const CURATED_LEVEL_NAMES = CURATED_LEVELS.map((l) => l.name);

export interface TileSnapshot {
  index: number;
  col: number;
  row: number;
  color: number;
  dir: number;
  alive: boolean;
  unblocked: boolean;
  worldX: number;
  worldZ: number;
  screenX: number;
  screenY: number;
}

export interface AudioEventCounters {
  stitchEvents: number;
  lastStitchColor: number;
  trayEvents: number;
  blockedEvents: number;
  undoEvents: number;
  hintEvents: number;
  colorClearEvents: number;
  layerClearEvents: number;
  completeEvents: number;
}

export interface SimSnapshot {
  frameCount: number;
  elapsedSec: number;
  levelIndex: number;
  chapterIndex: number;
  seed: number;
  levelName: string;
  mode: GameMode;
  phase: GamePhase;
  timeOfDayHours: number;
  themeIndex: number;
  isAnimating: boolean;
  flyingCount: number;
  score: number;
  streak: number;
  maxStreak: number;
  multiplier: number;
  directCount: number;
  trayUses: number;
  undoUsed: number;
  hintsUsed: number;
  stars: number;
  layersComplete: number;
  totalLayers: number;
  lastScoreDelta: number;
  lastPenaltyDelta: number;
  lastBlockerIdx: number;
  lastEventWorldX: number;
  lastEventWorldZ: number;
  nextQueuedColor: number;
  trayTension: number;
  undoDepth: number;
  stitchedCount: number;
  totalPearls: number;
  activeColors: number[];
  activeRemain: number[];
  trayColors: number[];
  trayCapacity: number;
  hintTileIndex: number;
  hintNeedsUndo: boolean;
  gridCols: number;
  gridRows: number;
  daylightFactor: number;
  sunIntensity: number;
  tiles: TileSnapshot[];
  events: AudioEventCounters;
}

interface SimExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  sim_reset: () => void;
  sim_load_level: (idx: number) => void;
  sim_load_mandala: (seed: number) => void;
  sim_load_daily: (dateKey: number) => void;
  sim_step: (dt: number) => void;
  sim_set_time_of_day: (hours: number) => void;
  sim_set_theme: (themeIdx: number) => void;
  sim_tap_world: (wx: number, wz: number) => number;
  sim_tap_tile: (idx: number) => number;
  sim_undo: () => number;
  sim_hint: () => number;
  sim_trigger_active_wiggle: () => number;
  sim_scene_ptr: () => number;
  sim_scene_len: () => number;
  sim_state_ptr: () => number;
  sim_state_len: () => number;
  sim_tiles_ptr: () => number;
  sim_tiles_len: () => number;
}

const MODE_MAP: GameMode[] = ['curated', 'mandala', 'daily'];
const PHASE_MAP: GamePhase[] = ['playing', 'tray_full', 'complete'];

export class WasmSimulation {
  private readonly exports: SimExports;
  private readonly scenePtr: number;
  private readonly sceneLen: number;
  private readonly statePtr: number;
  private readonly stateLen: number;
  private readonly tilesPtr: number;
  private readonly tilesLen: number;

  private constructor(exports: SimExports) {
    this.exports = exports;
    this.exports._initialize?.();
    this.exports.sim_reset();
    this.scenePtr = this.exports.sim_scene_ptr();
    this.sceneLen = this.exports.sim_scene_len();
    this.statePtr = this.exports.sim_state_ptr();
    this.stateLen = this.exports.sim_state_len();
    this.tilesPtr = this.exports.sim_tiles_ptr();
    this.tilesLen = this.exports.sim_tiles_len();
  }

  static async load(url = './game.wasm'): Promise<WasmSimulation> {
    let memoryRef: WebAssembly.Memory | null = null;
    const decoder = new TextDecoder();

    const imports: WebAssembly.Imports = {
      wasi_snapshot_preview1: {
        fd_write: (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number => {
          if (!memoryRef) return 0;
          const view = new DataView(memoryRef.buffer);
          let total = 0;
          let text = '';
          for (let i = 0; i < iovsLen; i++) {
            const ptr = view.getUint32(iovsPtr + i * 8, true);
            const len = view.getUint32(iovsPtr + i * 8 + 4, true);
            text += decoder.decode(new Uint8Array(memoryRef.buffer, ptr, len));
            total += len;
          }
          if (text.trim().length > 0) {
            if (fd === 2) console.error('[wasm]', text.trimEnd());
            else console.log('[wasm]', text.trimEnd());
          }
          view.setUint32(nwrittenPtr, total, true);
          return 0;
        },
        random_get: (bufPtr: number, bufLen: number): number => {
          if (!memoryRef) return 0;
          const slice = new Uint8Array(memoryRef.buffer, bufPtr, bufLen);
          crypto.getRandomValues(slice);
          return 0;
        },
        proc_exit: (code: number): void => {
          throw new Error(`WASM proc_exit(${code})`);
        },
      },
    };

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }

    let instance: WebAssembly.Instance;
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const streamed = await WebAssembly.instantiateStreaming(response.clone(), imports);
        instance = streamed.instance;
      } catch {
        const bytes = await response.arrayBuffer();
        const fallback = await WebAssembly.instantiate(bytes, imports);
        instance = fallback.instance;
      }
    } else {
      const bytes = await response.arrayBuffer();
      const instantiated = await WebAssembly.instantiate(bytes, imports);
      instance = instantiated.instance;
    }

    const exports = instance.exports as unknown as SimExports;
    memoryRef = exports.memory;

    return new WasmSimulation(exports);
  }

  get sceneByteLength(): number {
    return this.sceneLen * 4;
  }

  reset(): void {
    this.exports.sim_reset();
  }

  loadLevel(index: number): void {
    this.exports.sim_load_level(Math.max(0, Math.floor(index)));
  }

  loadMandala(seed: number): void {
    this.exports.sim_load_mandala(Math.max(1, Math.floor(seed)) >>> 0);
  }

  loadDaily(dateKey: number): void {
    this.exports.sim_load_daily(Math.max(1, Math.floor(dateKey)) >>> 0);
  }

  step(dt: number): void {
    this.exports.sim_step(dt);
  }

  setTimeOfDayHours(hours: number): void {
    this.exports.sim_set_time_of_day(hours);
  }

  setTheme(themeIndex: number): void {
    this.exports.sim_set_theme(Math.max(0, Math.min(VISUAL_THEMES.length - 1, Math.floor(themeIndex))));
  }

  tapWorld(wx: number, wz: number): boolean {
    return this.exports.sim_tap_world(wx, wz) !== 0;
  }

  tapTile(index: number): boolean {
    return this.exports.sim_tap_tile(index) !== 0;
  }

  undo(): boolean {
    return this.exports.sim_undo() !== 0;
  }

  hint(): number {
    return this.exports.sim_hint();
  }

  triggerActiveWiggle(): number {
    return this.exports.sim_trigger_active_wiggle();
  }

  sceneView(): Float32Array {
    return new Float32Array(this.exports.memory.buffer, this.scenePtr, this.sceneLen);
  }

  /** Zero-allocation read of current simulation phase (0=playing, 1=tray_full, 2=complete). */
  phase(): number {
    const view = new Float32Array(this.exports.memory.buffer, this.statePtr + 4 * 4, 1);
    return Math.round(view[0]);
  }

  /** Zero-allocation check for whether any 3D motion, wiggle, or temporary unlock glow is active. */
  isAnimating(): boolean {
    const view = new Float32Array(this.exports.memory.buffer, this.statePtr + 6 * 4, 1);
    return view[0] > 0.5;
  }

  /** Zero-allocation read of current score for DOM ticker smoothing while GPU idles. */
  score(): number {
    const view = new Float32Array(this.exports.memory.buffer, this.statePtr + 7 * 4, 1);
    return Math.round(view[0]);
  }

  readState(aspect: number): SimSnapshot {
    const s = new Float32Array(this.exports.memory.buffer, this.statePtr, this.stateLen);
    const tBuf = new Float32Array(this.exports.memory.buffer, this.tilesPtr, this.tilesLen);
    const scene = this.sceneView();

    const levelIndex = Math.round(s[2]);
    const modeIdx = Math.round(s[3]);
    const phaseIdx = Math.round(s[4]);
    const themeIndex = Math.round(s[32]);
    const chapterIndex = s.length > 51 ? Math.round(s[51]) : 0;
    const seed =
      s.length > 53
        ? (((Math.round(s[52]) & 0xffff) | ((Math.round(s[53]) & 0xffff) << 16)) >>> 0)
        : 0;

    const activeColors: number[] = [];
    const activeRemain: number[] = [];
    const c0 = Math.round(s[11]);
    const c1 = Math.round(s[12]);
    const r0 = Math.round(s[13]);
    const r1 = Math.round(s[14]);
    if (c0 >= 0 && r0 > 0) {
      activeColors.push(c0);
      activeRemain.push(r0);
    }
    if (c1 >= 0 && r1 > 0) {
      activeColors.push(c1);
      activeRemain.push(r1);
    }

    const trayLen = Math.round(s[15]);
    const trayColors: number[] = [];
    for (let i = 0; i < trayLen && i < 5; i++) {
      trayColors.push(Math.round(s[16 + i]));
    }

    const tileCount = Math.round(s[24]);
    const tiles: TileSnapshot[] = [];
    for (let i = 0; i < tileCount; i++) {
      const off = i * 8;
      const wx = tBuf[off + 6];
      const wz = tBuf[off + 7];
      const proj = projectWorldToScreen(wx, 0.14, wz, aspect);
      tiles.push({
        index: i,
        col: Math.round(tBuf[off + 0]),
        row: Math.round(tBuf[off + 1]),
        color: Math.round(tBuf[off + 2]),
        dir: Math.round(tBuf[off + 3]),
        alive: tBuf[off + 4] > 0.5,
        unblocked: tBuf[off + 5] > 0.5,
        worldX: wx,
        worldZ: wz,
        screenX: proj.screenX,
        screenY: proj.screenY,
      });
    }

    const mode = MODE_MAP[modeIdx] ?? 'curated';
    const levelName =
      mode === 'curated'
        ? (CURATED_LEVEL_NAMES[levelIndex % CURATED_LEVEL_NAMES.length] ?? `Pattern ${levelIndex + 1}`)
        : mode === 'daily'
          ? `Daily #${seed || levelIndex}`
          : `Seed #${seed || levelIndex}`;

    const hintTileIndex = Math.round(s[21]);

    return {
      frameCount: Math.round(s[0]),
      elapsedSec: s[1],
      levelIndex,
      chapterIndex,
      seed,
      levelName,
      mode,
      phase: PHASE_MAP[phaseIdx] ?? 'playing',
      timeOfDayHours: s[5],
      themeIndex,
      isAnimating: s[6] > 0.5,
      flyingCount: Math.round(scene[30] ?? 0),
      score: Math.round(s[7]),
      streak: Math.round(s[33]),
      maxStreak: Math.round(s[34]),
      multiplier: Math.max(1, Math.round(s[35])),
      directCount: Math.round(s[36]),
      trayUses: Math.round(s[37]),
      undoUsed: Math.round(s[38]),
      hintsUsed: s.length > 48 ? Math.round(s[48]) : 0,
      stars: Math.round(s[39]),
      layersComplete: Math.round(s[40]),
      totalLayers: Math.round(s[41]),
      lastScoreDelta: Math.round(s[44]),
      lastPenaltyDelta: s.length > 50 ? Math.round(s[50]) : 0,
      lastBlockerIdx: Math.round(s[45]),
      lastEventWorldX: s[46],
      lastEventWorldZ: s[47],
      nextQueuedColor: Math.round(scene[61] ?? -1),
      trayTension: scene[51] ?? 0,
      undoDepth: Math.round(s[8]),
      stitchedCount: Math.round(s[9]),
      totalPearls: Math.round(s[10]),
      activeColors,
      activeRemain,
      trayColors,
      trayCapacity: 5,
      hintTileIndex,
      hintNeedsUndo: hintTileIndex === HINT_NEEDS_UNDO,
      gridCols: Math.round(s[22]),
      gridRows: Math.round(s[23]),
      daylightFactor: s[31],
      sunIntensity: s[31],
      tiles,
      events: {
        stitchEvents: Math.round(s[25]),
        lastStitchColor: Math.round(s[26]),
        trayEvents: Math.round(s[27]),
        blockedEvents: Math.round(s[28]),
        undoEvents: Math.round(s[29]),
        hintEvents: s.length > 49 ? Math.round(s[49]) : 0,
        colorClearEvents: Math.round(s[42]),
        layerClearEvents: Math.round(s[43]),
        completeEvents: Math.round(s[30]),
      },
    };
  }
}
