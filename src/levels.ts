import { CHAPTERS, CURATED_LEVELS, type ChapterDef } from './wasmBridge';

const LEVELS_CACHE_KEY = 'pearl-loom-levels-catalog-v1';

/** Compact 4-tuple stitch entry in levels.json: [x, z, colorIndex, layerIndex]. */
export type RemoteStitchTuple = readonly [number, number, number, number];

export interface RemoteLevelDef {
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
  stitches?: readonly RemoteStitchTuple[];
  // Derived UI summary fields
  grid: string;
  pearls: number;
  colors: readonly number[];
}

export interface RemoteChapterDef extends ChapterDef {
  levelIds: readonly number[];
}

export interface LevelsCatalog {
  version: number;
  source: 'network' | 'cache' | 'builtin';
  chapters: readonly RemoteChapterDef[];
  levels: readonly RemoteLevelDef[];
}

interface RawLevelsPayload {
  version?: number;
  chapters?: Array<{
    id: number;
    roman: string;
    name: string;
    shortName: string;
    themeId: number;
    subtitle: string;
  }>;
  levels?: Array<{
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
    stitches: RemoteStitchTuple[];
  }>;
}

function normalizePayload(raw: RawLevelsPayload, source: 'network' | 'cache'): LevelsCatalog | null {
  if (!raw || !Array.isArray(raw.chapters) || !Array.isArray(raw.levels) || raw.levels.length === 0) {
    return null;
  }

  const levels: RemoteLevelDef[] = [];
  for (const item of raw.levels) {
    if (
      !item ||
      typeof item.id !== 'number' ||
      typeof item.cols !== 'number' ||
      typeof item.rows !== 'number' ||
      !Array.isArray(item.stitches) ||
      item.stitches.length === 0
    ) {
      continue;
    }
    const colorSet = new Set<number>();
    for (const st of item.stitches) {
      if (Array.isArray(st) && typeof st[2] === 'number') {
        colorSet.add(st[2]);
      }
    }
    const colors = Array.from(colorSet).sort((a, b) => a - b);
    levels.push({
      id: item.id,
      chapter: item.chapter ?? 0,
      theme: item.theme ?? 0,
      name: String(item.name || `Pattern ${item.id + 1}`),
      cols: item.cols,
      rows: item.rows,
      difficulty: item.difficulty ?? 1,
      seed: (item.seed >>> 0) || (item.id + 1) * 1009,
      noBlockers: Boolean(item.noBlockers),
      maxHearts: typeof item.maxHearts === 'number' ? item.maxHearts : 0,
      stitches: item.stitches,
      grid: `${item.cols}×${item.rows}`,
      pearls: item.stitches.length,
      colors,
    });
  }

  if (levels.length === 0) return null;

  const chapters: RemoteChapterDef[] = raw.chapters.map((ch) => {
    const matching = levels.filter((l) => l.chapter === ch.id);
    const firstIdx = matching.length > 0 ? levels.indexOf(matching[0]) : 0;
    return {
      id: ch.id,
      roman: ch.roman || String(ch.id + 1),
      name: ch.name || `World ${ch.id + 1}`,
      shortName: ch.shortName || ch.name || `World ${ch.id + 1}`,
      themeId: ch.themeId ?? 0,
      subtitle: ch.subtitle || '',
      startIndex: Math.max(0, firstIdx),
      count: matching.length,
      levelIds: matching.map((l) => l.id),
    };
  });

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    source,
    chapters,
    levels,
  };
}

export function getBuiltinLevelsCatalog(): LevelsCatalog {
  const levels: RemoteLevelDef[] = CURATED_LEVELS.map((l) => {
    const [cStr, rStr] = l.grid.split('×');
    return {
      id: l.id,
      chapter: l.chapter,
      theme: l.theme,
      name: l.name,
      cols: Number(cStr) || 5,
      rows: Number(rStr) || 5,
      difficulty: 1,
      seed: (l.id + 1) * 1001,
      grid: l.grid,
      pearls: l.pearls,
      colors: l.colors,
    };
  });

  const chapters: RemoteChapterDef[] = CHAPTERS.map((ch) => {
    const matching = levels.filter((l) => l.chapter === ch.id);
    return {
      ...ch,
      count: matching.length,
      levelIds: matching.map((l) => l.id),
    };
  });

  return {
    version: 1,
    source: 'builtin',
    chapters,
    levels,
  };
}

/**
 * Fetches curated levels from server JSON (`./levels.json`) network-first and caches them locally
 * so new levels can be pushed without updating the app while preserving 100% offline play!
 */
export async function loadLevelsCatalog(url = './levels.json'): Promise<LevelsCatalog> {
  // 1. Network-first fetch so fresh server-pushed levels arrive immediately on launch
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) {
      const raw = (await res.json()) as RawLevelsPayload;
      const parsed = normalizePayload(raw, 'network');
      if (parsed) {
        try {
          localStorage.setItem(LEVELS_CACHE_KEY, JSON.stringify(raw));
        } catch {
          // Non-fatal if storage quota is full
        }
        return parsed;
      }
    }
  } catch {
    // Offline or restricted network -> fall through to cached catalog
  }

  // 2. Offline localStorage cache fallback
  try {
    const cachedStr = localStorage.getItem(LEVELS_CACHE_KEY);
    if (cachedStr) {
      const parsed = normalizePayload(JSON.parse(cachedStr) as RawLevelsPayload, 'cache');
      if (parsed) return parsed;
    }
  } catch {
    // Corrupted cache -> fall through to built-in catalog
  }

  // 3. Built-in compiled fallback (first-ever offline launch)
  return getBuiltinLevelsCatalog();
}
