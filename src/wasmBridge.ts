import { projectWorldToScreen } from './camera';

export type GameMode = 'curated' | 'mandala' | 'daily' | 'custom';
export type GamePhase = 'playing' | 'tray_full' | 'complete';

export const HINT_NEEDS_UNDO = -2;

export const SPECIAL_MASK = {
  HEART: 1 << 0,
  RAINBOW: 1 << 1,
  HIDDEN: 1 << 2,
  LOCKED: 1 << 3,
} as const;

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
  { id: 0, roman: 'I', name: 'Jewel Atelier', shortName: 'Jewel', themeId: 0, subtitle: 'Sunlit gemstones & artisan brooches', startIndex: 0, count: 13 },
  { id: 1, roman: 'II', name: 'Cyber Arcade', shortName: 'Neon', themeId: 1, subtitle: 'Electric synthwave grids & pulses', startIndex: 13, count: 13 },
  { id: 2, roman: 'III', name: 'Pop Studio', shortName: 'Pop', themeId: 2, subtitle: 'Bold Warhol primaries & comic ink', startIndex: 26, count: 13 },
  { id: 3, roman: 'IV', name: 'Cathedral Glass', shortName: 'Prism', themeId: 3, subtitle: 'Grand rose windows & glowing glass', startIndex: 39, count: 13 },
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

export type SeedDifficultyTier = 0 | 1 | 2 | 3;

export interface SeedDifficultyDef {
  id: SeedDifficultyTier;
  name: string;
  grid: string;
  specials: string;
  tagline: string;
}

export const SEED_DIFFICULTIES: readonly SeedDifficultyDef[] = [
  { id: 0, name: 'Easy', grid: '5×5', specials: '♥', tagline: '5×5 · Hearts' },
  { id: 1, name: 'Medium', grid: '6×6', specials: '♥ 🌈', tagline: '6×6 · Hearts + Rainbow' },
  { id: 2, name: 'Hard', grid: '7×7', specials: '♥ 🌈 ?', tagline: '7×7 · + Hidden' },
  { id: 3, name: 'Extreme', grid: '8×8', specials: '♥ 🌈 ? 🔒', tagline: '8×8 · All Specials' },
] as const;

export const TUNING_PARAM = {
  LOAD_DELAY: 0,
  UNLOCK_DELAY: 1,
  JIGGLE_INTENSITY: 2,
  TOP_LIGHT: 3,
  GLOW_INTENSITY: 4,
  SHAKE_INTENSITY: 5,
  HEART_BONUS_MAX: 6,
  HEART_BONUS_MIN: 7,
  HINT_PENALTY: 8,
  UNDO_PENALTY: 9,
} as const;

export type SpecialPearlKind = 'none' | 'heart' | 'rainbow' | 'hidden' | 'locked';

export interface CuratedLevelDef {
  id: number;
  chapter: number;
  theme: number;
  name: string;
  grid: string;
  pearls: number;
  difficulty: number;
  noBlockers: boolean;
  maxHearts: number;
  maxRainbows: number;
  maxHidden: number;
  maxLocked: number;
  colors: readonly number[];
}

const CAMPAIGN_LADDER_META = [
  { grid: '5×5', pearls: 14, difficulty: 0, noBlockers: true, colorCount: 3, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0 },
  { grid: '5×5', pearls: 16, difficulty: 0, noBlockers: true, colorCount: 4, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0 },
  { grid: '5×5', pearls: 21, difficulty: 1, noBlockers: false, colorCount: 4, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0 },
  { grid: '6×5', pearls: 26, difficulty: 2, noBlockers: false, colorCount: 4, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0 },
  { grid: '6×6', pearls: 32, difficulty: 3, noBlockers: false, colorCount: 5, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0 },
  { grid: '7×6', pearls: 37, difficulty: 4, noBlockers: false, colorCount: 5, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0 },
  { grid: '7×7', pearls: 43, difficulty: 5, noBlockers: false, colorCount: 5, maxHearts: 2, maxRainbows: 1, maxHidden: 2, maxLocked: 0 },
  { grid: '8×6', pearls: 45, difficulty: 6, noBlockers: false, colorCount: 6, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 0 },
  { grid: '8×7', pearls: 51, difficulty: 7, noBlockers: false, colorCount: 6, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 1 },
  { grid: '8×8', pearls: 54, difficulty: 8, noBlockers: false, colorCount: 6, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 1 },
  { grid: '8×8', pearls: 58, difficulty: 9, noBlockers: false, colorCount: 6, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2 },
  { grid: '8×8', pearls: 61, difficulty: 10, noBlockers: false, colorCount: 6, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2 },
  { grid: '8×8', pearls: 62, difficulty: 11, noBlockers: false, colorCount: 6, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 3 },
] as const;

const CAMPAIGN_LEVEL_NAMES: readonly (readonly string[])[] = [
  [
    'Sunbeam Brooch', 'Dewdrop Ring', 'Jewel Heart', 'Sakura Bloom',
    'Royal Crown', 'Emerald Clover', 'Monarch Crest', 'Sapphire Fan',
    'Velvet Lotus', 'Nautilus Gold', 'Imperial Tiara', 'Starlight Filigree',
    'Grand Jewel Rose',
  ],
  [
    'Neon Spark', 'Bit Halo', 'Neon Pulse', 'Synth Diamond',
    'Pixel Star', 'Laser Spiral', 'Arcade Core', 'Vector Grid',
    'Flux Portal', 'Hyper Matrix', 'Volt Overdrive', 'Quantum Circuit',
    'Cyber Singularity',
  ],
  [
    'Pop Dot', 'Comic Ring', 'Comic Star', 'Pop Heart',
    'Halftone Bolt', 'Warhol Bloom', 'Boom Burst', 'Retro Sun',
    'Pop Diamond', 'Studio Crown', 'Super Flash', 'Gallery Splash',
    'Grand Pop Burst',
  ],
  [
    'Candle Shard', 'Silver Chalice', 'Prism Lantern', 'Gothic Arch',
    'Angel Crest', 'Aurora Spire', 'Cathedral Cross', 'Vespers Halo',
    'Radiant Choir', 'Stained Compass', 'Sapphire Nave', 'Celestial Vault',
    'Grand Rose Window',
  ],
];

const CAMPAIGN_PAL_ORDERS: readonly (readonly number[])[] = [
  [3, 5, 0, 4, 2, 1],
  [1, 0, 2, 3, 4, 5],
  [3, 0, 1, 4, 2, 5],
  [3, 5, 0, 1, 4, 2],
];

export const CURATED_LEVELS: readonly CuratedLevelDef[] = CAMPAIGN_LEVEL_NAMES.flatMap((names, ch) =>
  names.map((name, idx) => {
    const meta = CAMPAIGN_LADDER_META[idx];
    const pal = CAMPAIGN_PAL_ORDERS[ch];
    return {
      id: ch * 13 + idx,
      chapter: ch,
      theme: ch,
      name,
      grid: meta.grid,
      pearls: meta.pearls,
      difficulty: meta.difficulty,
      noBlockers: meta.noBlockers,
      maxHearts: meta.maxHearts,
      maxRainbows: meta.maxRainbows,
      maxHidden: meta.maxHidden,
      maxLocked: meta.maxLocked,
      colors: [...pal.slice(0, meta.colorCount)].sort((a, b) => a - b),
    };
  }),
);

export const CURATED_LEVEL_NAMES = CURATED_LEVELS.map((l) => l.name);

export interface TileSnapshot {
  index: number;
  col: number;
  row: number;
  color: number;
  dir: number;
  alive: boolean;
  isHeart: boolean;
  special: SpecialPearlKind;
  hiddenConcealed: boolean;
  lockedNow: boolean;
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
  heartClearEvents: number;
  rainbowClearEvents: number;
  hiddenRevealEvents: number;
  lockBreakEvents: number;
  lockedTapEvents: number;
  queueEvents: number;
  completeEvents: number;
}

export interface SimSnapshot {
  frameCount: number;
  elapsedSec: number;
  levelIndex: number;
  chapterIndex: number;
  seed: number;
  seedDifficulty: SeedDifficultyTier;
  customSpecialMask: number;
  introActive: boolean;
  introProgress: number;
  finalColorMode: boolean;
  queuedCount: number;
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
  lastHeartBonus: number;
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

export interface CustomLevelPayload {
  id: number;
  chapter: number;
  theme: number;
  name: string;
  cols: number;
  rows: number;
  difficulty: number;
  seed: number;
  noBlockers?: boolean;
  maxHearts?: number;
  maxRainbows?: number;
  maxHidden?: number;
  maxLocked?: number;
  stitches?: readonly (readonly [number, number, number, number])[];
}

interface SimExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  sim_reset: () => void;
  sim_load_level: (idx: number) => void;
  sim_load_mandala: (seed: number) => void;
  sim_load_mandala_diff?: (seed: number, diffTier: number) => void;
  sim_load_mandala_styled?: (seed: number, diffTier: number, theme: number) => void;
  sim_load_custom_gen?: (
    seed: number,
    theme: number,
    cols: number,
    rows: number,
    colorCount: number,
    specialMask: number,
  ) => void;
  sim_start_intro_unravel?: () => void;
  sim_skip_intro_unravel?: () => void;
  sim_load_daily: (dateKey: number) => void;
  sim_step: (dt: number) => void;
  sim_set_time_of_day: (hours: number) => void;
  sim_set_theme: (themeIdx: number) => void;
  sim_set_tuning?: (paramId: number, val: number) => void;
  sim_tap_world: (wx: number, wz: number) => number;
  sim_tap_tile: (idx: number) => number;
  sim_undo: () => number;
  sim_hint: () => number;
  sim_trigger_active_wiggle: () => number;
  sim_trigger_rainbow_wiggle?: () => number;
  sim_scene_ptr: () => number;
  sim_scene_len: () => number;
  sim_state_ptr: () => number;
  sim_state_len: () => number;
  sim_tiles_ptr: () => number;
  sim_tiles_len: () => number;
  sim_custom_level_ptr?: () => number;
  sim_custom_level_len?: () => number;
  sim_load_custom_level?: (stitchCount: number) => number;
}

const MODE_MAP: GameMode[] = ['curated', 'mandala', 'daily', 'custom'];
const PHASE_MAP: GamePhase[] = ['playing', 'tray_full', 'complete'];

export class WasmSimulation {
  private readonly exports: SimExports;
  private readonly scenePtr: number;
  private readonly sceneLen: number;
  private readonly statePtr: number;
  private readonly stateLen: number;
  private readonly tilesPtr: number;
  private readonly tilesLen: number;
  private readonly customLevelPtr: number;
  private readonly customLevelLen: number;
  private activeCustomName: string | null = null;

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
    this.customLevelPtr = this.exports.sim_custom_level_ptr?.() ?? 0;
    this.customLevelLen = this.exports.sim_custom_level_len?.() ?? 0;
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
    this.activeCustomName = null;
    this.exports.sim_load_level(Math.max(0, Math.floor(index)));
  }

  /** Loads a remote/cached JSON level directly into WASM memory via zero-alloc flat staging buffer. */
  loadCustomLevel(def: CustomLevelPayload): boolean {
    const stitches = def.stitches;
    const HEADER_LEN = 14;
    if (
      !stitches ||
      stitches.length === 0 ||
      !this.exports.sim_load_custom_level ||
      this.customLevelPtr === 0 ||
      HEADER_LEN + stitches.length * 4 > this.customLevelLen
    ) {
      this.activeCustomName = def.name || null;
      this.exports.sim_load_level(Math.max(0, Math.floor(def.id)));
      return false;
    }

    const buf = new Float32Array(this.exports.memory.buffer, this.customLevelPtr, this.customLevelLen);
    const seed = (def.seed >>> 0) || (def.id + 1) * 1009;
    buf[0] = def.id;
    buf[1] = def.chapter;
    buf[2] = def.theme;
    buf[3] = def.cols;
    buf[4] = def.rows;
    buf[5] = def.difficulty;
    buf[6] = seed & 0xffff;
    buf[7] = (seed >>> 16) & 0xffff;
    buf[8] = def.noBlockers ? 1 : 0;
    buf[9] = def.maxHearts ?? 0;
    buf[10] = def.maxRainbows ?? 0;
    buf[11] = def.maxHidden ?? 0;
    buf[12] = def.maxLocked ?? 0;
    buf[13] = 0;

    for (let i = 0; i < stitches.length; i++) {
      const off = HEADER_LEN + i * 4;
      const st = stitches[i];
      buf[off + 0] = st[0];
      buf[off + 1] = st[1];
      buf[off + 2] = st[2];
      buf[off + 3] = st[3];
    }

    const ok = this.exports.sim_load_custom_level(stitches.length) !== 0;
    this.activeCustomName = ok ? def.name : null;
    return ok;
  }

  loadMandala(seed: number, diffTier?: SeedDifficultyTier, theme = -1): void {
    this.activeCustomName = null;
    const s = Math.max(1, Math.floor(seed)) >>> 0;
    const d = typeof diffTier === 'number' ? Math.max(0, Math.min(3, Math.floor(diffTier))) : 1;
    if (this.exports.sim_load_mandala_styled) {
      this.exports.sim_load_mandala_styled(s, d, Math.floor(theme));
    } else if (typeof diffTier === 'number' && this.exports.sim_load_mandala_diff) {
      this.exports.sim_load_mandala_diff(s, d);
    } else {
      this.exports.sim_load_mandala(s);
    }
  }

  loadCustomGenerated(opts: {
    seed: number;
    theme: number;
    cols: number;
    rows: number;
    colorCount: number;
    specialMask: number;
  }): void {
    this.activeCustomName = null;
    const s = Math.max(1, Math.floor(opts.seed)) >>> 0;
    const cols = Math.max(5, Math.min(8, Math.floor(opts.cols)));
    const rows = Math.max(5, Math.min(8, Math.floor(opts.rows)));
    const colors = Math.max(3, Math.min(6, Math.floor(opts.colorCount)));
    const theme = Math.max(0, Math.min(VISUAL_THEMES.length - 1, Math.floor(opts.theme)));
    const mask = (opts.specialMask >>> 0) & 0x0f;
    if (this.exports.sim_load_custom_gen) {
      this.exports.sim_load_custom_gen(s, theme, cols, rows, colors, mask);
    } else {
      this.loadMandala(s, 1, theme);
    }
  }

  startIntroUnravel(): void {
    this.exports.sim_start_intro_unravel?.();
  }

  skipIntroUnravel(): void {
    this.exports.sim_skip_intro_unravel?.();
  }

  loadDaily(dateKey: number): void {
    this.activeCustomName = null;
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

  setTuning(paramId: number, value: number): void {
    this.exports.sim_set_tuning?.(paramId, value);
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

  triggerRainbowWiggle(): number {
    return this.exports.sim_trigger_rainbow_wiggle?.() ?? -1;
  }

  sceneView(): Float32Array {
    return new Float32Array(this.exports.memory.buffer, this.scenePtr, this.sceneLen);
  }

  /**
   * Snapshots the current pattern's normalized hoop stitches [normX, normZ, colorIdx] directly
   * from WASM SceneHoopOffset (offset 600) for compact localStorage embroidery archive previews!
   */
  readHoopPreviewStitches(): [number, number, number][] {
    const s = new Float32Array(this.exports.memory.buffer, this.statePtr, this.stateLen);
    const hoopCount = Math.max(0, Math.min(64, Math.round(s[10] ?? 0)));
    const scene = this.sceneView();
    const SCENE_HOOP_OFFSET = 64 + 6 * 4 + 64 * 8; // 600
    const HOOP_CENTER_Z = -1.84;
    const HOOP_SPAN = 1.38 * 0.86;
    const out: [number, number, number][] = [];
    for (let i = 0; i < hoopCount; i++) {
      const base = SCENE_HOOP_OFFSET + i * 8;
      const nx = Math.round((scene[base + 0] / HOOP_SPAN) * 1000) / 1000;
      const nz = Math.round(((scene[base + 2] - HOOP_CENTER_Z) / HOOP_SPAN) * 1000) / 1000;
      const color = Math.max(0, Math.min(5, Math.round(scene[base + 4])));
      out.push([nx, nz, color]);
    }
    return out;
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

  /** Zero-allocation check for whether Final-Color Victory Rush Mode is active. */
  isFinalColorMode(): boolean {
    if (this.stateLen <= 61) return false;
    const view = new Float32Array(this.exports.memory.buffer, this.statePtr + 61 * 4, 1);
    return view[0] > 0.5;
  }

  /** Zero-allocation check for whether the 3D First-Load Unravel Intro is still playing. */
  isIntroActive(): boolean {
    if (this.stateLen <= 64) return false;
    const view = new Float32Array(this.exports.memory.buffer, this.statePtr + 64 * 4, 1);
    return view[0] > 0.5;
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
    const rawDiff = s.length > 60 ? Math.round(s[60]) : 1;
    const seedDifficulty = Math.max(0, Math.min(3, rawDiff)) as SeedDifficultyTier;
    const finalColorMode = s.length > 61 ? s[61] > 0.5 : false;
    const queuedCount = s.length > 62 ? Math.round(s[62]) : 0;
    const introActive = s.length > 64 ? s[64] > 0.5 : false;
    const introProgress = s.length > 65 ? s[65] : 1;
    const customSpecialMask = s.length > 66 ? Math.round(s[66]) : 0;

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
      const stCode = Math.round(tBuf[off + 4]);
      let special: SpecialPearlKind = 'none';
      if (stCode === 2) special = 'heart';
      else if (stCode === 3) special = 'rainbow';
      else if (stCode === 4 || stCode === 5) special = 'hidden';
      else if (stCode === 6 || stCode === 7) special = 'locked';
      const proj = projectWorldToScreen(wx, 0.14, wz, aspect);
      tiles.push({
        index: i,
        col: Math.round(tBuf[off + 0]),
        row: Math.round(tBuf[off + 1]),
        color: Math.round(tBuf[off + 2]),
        dir: Math.round(tBuf[off + 3]),
        alive: stCode > 0,
        isHeart: stCode === 2,
        special,
        hiddenConcealed: stCode === 4,
        lockedNow: stCode === 6,
        unblocked: tBuf[off + 5] > 0.5,
        worldX: wx,
        worldZ: wz,
        screenX: proj.screenX,
        screenY: proj.screenY,
      });
    }

    const mode = MODE_MAP[modeIdx] ?? 'curated';
    const diffLabel = SEED_DIFFICULTIES[seedDifficulty]?.name ?? 'Medium';
    const levelName =
      mode === 'curated'
        ? (this.activeCustomName ?? CURATED_LEVEL_NAMES[levelIndex % CURATED_LEVEL_NAMES.length] ?? `Pattern ${levelIndex + 1}`)
        : mode === 'daily'
          ? `Daily #${seed || levelIndex}`
          : mode === 'custom'
            ? `Custom ${Math.round(s[22])}×${Math.round(s[23])}`
            : `${diffLabel} #${seed || levelIndex}`;

    const hintTileIndex = Math.round(s[21]);

    return {
      frameCount: Math.round(s[0]),
      elapsedSec: s[1],
      levelIndex,
      chapterIndex,
      seed,
      seedDifficulty,
      customSpecialMask,
      introActive,
      introProgress,
      finalColorMode,
      queuedCount,
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
      lastHeartBonus: s.length > 55 ? Math.round(s[55]) : 0,
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
        heartClearEvents: s.length > 54 ? Math.round(s[54]) : 0,
        rainbowClearEvents: s.length > 56 ? Math.round(s[56]) : 0,
        hiddenRevealEvents: s.length > 57 ? Math.round(s[57]) : 0,
        lockBreakEvents: s.length > 58 ? Math.round(s[58]) : 0,
        lockedTapEvents: s.length > 59 ? Math.round(s[59]) : 0,
        queueEvents: s.length > 63 ? Math.round(s[63]) : 0,
        completeEvents: Math.round(s[30]),
      },
    };
  }
}
