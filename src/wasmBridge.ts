export interface SimSnapshot {
  frameCount: number;
  elapsedSec: number;
  score: number;
  player: { x: number; y: number; z: number; vx: number; vz: number };
  target: { x: number; y: number; z: number };
  pulse: number;
  arenaHalfW: number;
  arenaHalfD: number;
  pointerActive: boolean;
}

interface SimExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  sim_reset: () => void;
  sim_step: (dt: number) => void;
  sim_set_pointer: (nx: number, nz: number, active: number) => void;
  sim_scene_ptr: () => number;
  sim_scene_len: () => number;
  sim_state_ptr: () => number;
  sim_state_len: () => number;
}

export class WasmSimulation {
  private readonly exports: SimExports;
  private readonly scenePtr: number;
  private readonly sceneLen: number;
  private readonly statePtr: number;
  private readonly stateLen: number;

  private constructor(exports: SimExports) {
    this.exports = exports;
    this.exports._initialize?.();
    this.exports.sim_reset();
    this.scenePtr = this.exports.sim_scene_ptr();
    this.sceneLen = this.exports.sim_scene_len();
    this.statePtr = this.exports.sim_state_ptr();
    this.stateLen = this.exports.sim_state_len();
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
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, imports);
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

  step(dt: number): void {
    this.exports.sim_step(dt);
  }

  setPointerNormalized(nx: number, nz: number, active: boolean): void {
    this.exports.sim_set_pointer(nx, nz, active ? 1 : 0);
  }

  /** Zero-copy view into WASM linear memory for WebGPU upload. */
  sceneView(): Float32Array {
    return new Float32Array(this.exports.memory.buffer, this.scenePtr, this.sceneLen);
  }

  readState(): SimSnapshot {
    const s = new Float32Array(this.exports.memory.buffer, this.statePtr, this.stateLen);
    return {
      frameCount: Math.round(s[0]),
      elapsedSec: s[1],
      score: Math.round(s[2]),
      player: {
        x: s[3],
        y: s[4],
        z: s[5],
        vx: s[6],
        vz: s[7],
      },
      target: {
        x: s[8],
        y: s[9],
        z: s[10],
      },
      pulse: s[11],
      arenaHalfW: s[12],
      arenaHalfD: s[13],
      pointerActive: s[14] > 0.5,
    };
  }
}
