const CONFIG_CACHE_KEY = 'pearl-loom-config-v1';

export interface GameConfig {
  version: number;
  jiggle: {
    intervalMs: number;
    quietHandMs: number;
    rainbowIntervalMs: number;
    loadDelaySec: number;
    unlockDelaySec: number;
    intensity: number;
  };
  lighting: {
    topLightIntensity: number;
    glowIntensity: number;
  };
  feedback: {
    shakeIntensity: number;
    rumbleIntensity: number;
  };
  scoring: {
    heartBonusMax: number;
    heartBonusMin: number;
    hintPenalty: number;
    undoPenalty: number;
  };
}

export interface LoadedGameConfig {
  config: GameConfig;
  source: 'network' | 'cache' | 'defaults';
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  version: 1,
  jiggle: {
    intervalMs: 1250,
    quietHandMs: 1050,
    rainbowIntervalMs: 2200,
    loadDelaySec: 0.7,
    unlockDelaySec: 0.85,
    intensity: 1.0,
  },
  lighting: {
    topLightIntensity: 1.0,
    glowIntensity: 1.0,
  },
  feedback: {
    shakeIntensity: 1.0,
    rumbleIntensity: 1.0,
  },
  scoring: {
    heartBonusMax: 600,
    heartBonusMin: 150,
    hintPenalty: 250,
    undoPenalty: 150,
  },
};

function clampNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function normalizeGameConfig(raw: unknown): GameConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const j = obj.jiggle && typeof obj.jiggle === 'object' ? (obj.jiggle as Record<string, unknown>) : {};
  const l = obj.lighting && typeof obj.lighting === 'object' ? (obj.lighting as Record<string, unknown>) : {};
  const f = obj.feedback && typeof obj.feedback === 'object' ? (obj.feedback as Record<string, unknown>) : {};
  const s = obj.scoring && typeof obj.scoring === 'object' ? (obj.scoring as Record<string, unknown>) : {};

  return {
    version: clampNum(obj.version, DEFAULT_GAME_CONFIG.version, 1, 999),
    jiggle: {
      intervalMs: clampNum(j.intervalMs, DEFAULT_GAME_CONFIG.jiggle.intervalMs, 350, 10000),
      quietHandMs: clampNum(j.quietHandMs, DEFAULT_GAME_CONFIG.jiggle.quietHandMs, 200, 10000),
      rainbowIntervalMs: clampNum(j.rainbowIntervalMs, DEFAULT_GAME_CONFIG.jiggle.rainbowIntervalMs, 400, 10000),
      loadDelaySec: clampNum(j.loadDelaySec, DEFAULT_GAME_CONFIG.jiggle.loadDelaySec, 0, 4),
      unlockDelaySec: clampNum(j.unlockDelaySec, DEFAULT_GAME_CONFIG.jiggle.unlockDelaySec, 0, 4),
      intensity: clampNum(j.intensity, DEFAULT_GAME_CONFIG.jiggle.intensity, 0, 2.5),
    },
    lighting: {
      topLightIntensity: clampNum(l.topLightIntensity, DEFAULT_GAME_CONFIG.lighting.topLightIntensity, 0.25, 2.5),
      glowIntensity: clampNum(l.glowIntensity, DEFAULT_GAME_CONFIG.lighting.glowIntensity, 0, 2.5),
    },
    feedback: {
      shakeIntensity: clampNum(f.shakeIntensity, DEFAULT_GAME_CONFIG.feedback.shakeIntensity, 0, 2.5),
      rumbleIntensity: clampNum(f.rumbleIntensity, DEFAULT_GAME_CONFIG.feedback.rumbleIntensity, 0, 2.5),
    },
    scoring: {
      heartBonusMax: Math.round(clampNum(s.heartBonusMax, DEFAULT_GAME_CONFIG.scoring.heartBonusMax, 50, 5000)),
      heartBonusMin: Math.round(clampNum(s.heartBonusMin, DEFAULT_GAME_CONFIG.scoring.heartBonusMin, 0, 2000)),
      hintPenalty: Math.round(clampNum(s.hintPenalty, DEFAULT_GAME_CONFIG.scoring.hintPenalty, 0, 2000)),
      undoPenalty: Math.round(clampNum(s.undoPenalty, DEFAULT_GAME_CONFIG.scoring.undoPenalty, 0, 2000)),
    },
  };
}

/**
 * Fetches live tuning settings from `./config.json` with offline-safe `localStorage` caching.
 * Allows adjusting jiggle cadence, lighting, rumble/shake, and scoring on the server with zero rebuild.
 */
export async function loadGameConfig(url = './config.json'): Promise<LoadedGameConfig> {
  try {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (resp.ok) {
      const raw = await resp.json();
      const config = normalizeGameConfig(raw);
      try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
      } catch {
        // Ignore storage quota errors
      }
      return { config, source: 'network' };
    }
  } catch {
    // Offline or network timeout — fall back to cached config below
  }

  try {
    const cached = localStorage.getItem(CONFIG_CACHE_KEY);
    if (cached) {
      return { config: normalizeGameConfig(JSON.parse(cached)), source: 'cache' };
    }
  } catch {
    // Ignore corrupted cache
  }

  return { config: { ...DEFAULT_GAME_CONFIG }, source: 'defaults' };
}
