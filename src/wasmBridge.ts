import { projectWorldToScreen } from './camera';

export type GameMode = 'curated' | 'mandala' | 'daily';
export type GamePhase = 'playing' | 'tray_full' | 'complete';

export const PEARL_COLORS = [
  { name: 'Rose Quartz', hex: '#eb7a94' },
  { name: 'Ivory Pearl', hex: '#f5ede0' },
  { name: 'Sage Mint', hex: '#70bf97' },
  { name: 'Honey Gold', hex: '#f0b857' },
  { name: 'Lavender', hex: '#ad8fe0' },
  { name: 'Sky Blue', hex: '#6bb3e3' },
] as const;

export const CURATED_LEVELS = [
  { name: 'Rose Heart', pearls: 9, colors: [0, 1, 3] },
  { name: 'Sakura Blossom', pearls: 14, colors: [0, 1, 2, 3] },
  { name: 'Crescent Moon', pearls: 16, colors: [1, 3, 4, 5] },
  { name: 'Morning Butterfly', pearls: 18, colors: [0, 1, 3, 4, 5] },
  { name: 'Cozy Cat', pearls: 19, colors: [0, 1, 2, 3] },
  { name: 'Ocean Seashell', pearls: 20, colors: [0, 1, 3, 4, 5] },
  { name: 'Lucky Clover', pearls: 21, colors: [1, 2, 3, 5] },
  { name: 'Starlight Wreath', pearls: 24, colors: [0, 1, 2, 3, 4, 5] },
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
  completeEvents: number;
}

export interface SimSnapshot {
  frameCount: number;
  elapsedSec: number;
  levelIndex: number;
  levelName: string;
  mode: GameMode;
  phase: GamePhase;
  timeOfDayHours: number;
  isAnimating: boolean;
  moves: number;
  undoDepth: number;
  stitchedCount: number;
  totalPearls: number;
  activeColors: number[];
  activeRemain: number[];
  trayColors: number[];
  trayCapacity: number;
  hintTileIndex: number;
  gridCols: number;
  gridRows: number;
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
  sim_tap_world: (wx: number, wz: number) => number;
  sim_tap_tile: (idx: number) => number;
  sim_undo: () => number;
  sim_hint: () => number;
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

  sceneView(): Float32Array {
    return new Float32Array(this.exports.memory.buffer, this.scenePtr, this.sceneLen);
  }

  readState(aspect: number): SimSnapshot {
    const s = new Float32Array(this.exports.memory.buffer, this.statePtr, this.stateLen);
    const tBuf = new Float32Array(this.exports.memory.buffer, this.tilesPtr, this.tilesLen);

    const levelIndex = Math.round(s[2]);
    const modeIdx = Math.round(s[3]);
    const phaseIdx = Math.round(s[4]);
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
          ? 'Daily Stitch'
          : `Mandala #${levelIndex + 1}`;

    return {
      frameCount: Math.round(s[0]),
      elapsedSec: s[1],
      levelIndex,
      levelName,
      mode,
      phase: PHASE_MAP[phaseIdx] ?? 'playing',
      timeOfDayHours: s[5],
      isAnimating: s[6] > 0.5,
      moves: Math.round(s[7]),
      undoDepth: Math.round(s[8]),
      stitchedCount: Math.round(s[9]),
      totalPearls: Math.round(s[10]),
      activeColors,
      activeRemain,
      trayColors,
      trayCapacity: 5,
      hintTileIndex: Math.round(s[21]),
      gridCols: Math.round(s[22]),
      gridRows: Math.round(s[23]),
      sunIntensity: s[31],
      tiles,
      events: {
        stitchEvents: Math.round(s[25]),
        lastStitchColor: Math.round(s[26]),
        trayEvents: Math.round(s[27]),
        blockedEvents: Math.round(s[28]),
        undoEvents: Math.round(s[29]),
        completeEvents: Math.round(s[30]),
      },
    };
  }
}
