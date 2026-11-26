import { CHAPTERS, CURATED_LEVELS, generateRandomSeed, type SeedDifficultyTier } from './wasmBridge';

const GALLERY_STORAGE_KEY = 'pearl-loom-gallery-v2';
export const CURRENT_CATALOG_VERSION = 4;

export type SeenSpecialKind = 'heart' | 'rainbow' | 'hidden' | 'locked';

export interface CuratedCompletionRecord {
  bestScore: number;
  bestStars: number;
  bestMaxStreak: number;
  completedAt: string;
}

export interface DailyCompletionRecord {
  dateKey: number;
  dateLabel: string;
  theme: number;
  bestScore: number;
  bestStars: number;
  bestMaxStreak: number;
  grid: string;
  pearls: number;
  stitches: [number, number, number][];
}

export interface RandomCompletionRecord {
  seed: number;
  difficulty: SeedDifficultyTier;
  theme: number;
  bestScore: number;
  bestStars: number;
  bestMaxStreak: number;
  grid: string;
  pearls: number;
  completedAt: string;
  stitches: [number, number, number][];
}

export interface CustomCompletionRecord {
  seed: number;
  theme: number;
  cols: number;
  rows: number;
  colorCount: number;
  specialMask: number;
  bestScore: number;
  bestStars: number;
  bestMaxStreak: number;
  grid: string;
  pearls: number;
  completedAt: string;
  stitches: [number, number, number][];
}

export interface CustomModePrefs {
  cols: number;
  rows: number;
  colorCount: number;
  theme: number;
  hearts: boolean;
  rainbows: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface UserSettings {
  hapticsEnabled: boolean;
  timeMode: 'auto' | 'manual';
  manualHour: number;
}

export interface GalleryProgress {
  catalogVersion: number;
  completedCurated: Record<number, CuratedCompletionRecord>;
  completedDailyDates: string[];
  dailyHistory: DailyCompletionRecord[];
  randomHistory: RandomCompletionRecord[];
  customHistory: CustomCompletionRecord[];
  mandalasCompleted: number;
  lastMandalaSeed: number;
  selectedCampaign: number;
  seedDifficulty: SeedDifficultyTier;
  randomStylePref: number; // -1 = Random style, 0..3 = explicit world
  customPrefs: CustomModePrefs;
  onboardingCompleted: boolean;
  seenSpecials: SeenSpecialKind[];
  settings: UserSettings;
}

function defaultSettings(): UserSettings {
  return {
    hapticsEnabled: true,
    timeMode: 'auto',
    manualHour: 12.5,
  };
}

function defaultCustomPrefs(): CustomModePrefs {
  return {
    cols: 6,
    rows: 6,
    colorCount: 5,
    theme: 0,
    hearts: true,
    rainbows: true,
    hidden: false,
    locked: false,
  };
}

function emptyProgress(): GalleryProgress {
  return {
    catalogVersion: CURRENT_CATALOG_VERSION,
    completedCurated: {},
    completedDailyDates: [],
    dailyHistory: [],
    randomHistory: [],
    customHistory: [],
    mandalasCompleted: 0,
    lastMandalaSeed: 1,
    selectedCampaign: 0,
    seedDifficulty: 1,
    randomStylePref: -1,
    customPrefs: defaultCustomPrefs(),
    onboardingCompleted: false,
    seenSpecials: [],
    settings: defaultSettings(),
  };
}

export function getTodayDateKey(): { keyNum: number; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const keyNum = y * 10000 + m * 100 + d;
  const label = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { keyNum, label };
}

export function formatDateKeyLabel(dateKey: number): string {
  const s = String(Math.max(0, Math.floor(dateKey)));
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

export class EmbroideryGalleryStore {
  private data: GalleryProgress;

  constructor() {
    this.data = this.load();
  }

  private load(): GalleryProgress {
    try {
      const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
      if (!raw) return emptyProgress();
      const parsed = JSON.parse(raw) as Partial<GalleryProgress>;
      const s = parsed.settings ?? defaultSettings();
      const selCamp =
        typeof parsed.selectedCampaign === 'number' && parsed.selectedCampaign >= 0 && parsed.selectedCampaign < 4
          ? Math.floor(parsed.selectedCampaign)
          : 0;
      const seedDiff =
        typeof parsed.seedDifficulty === 'number' && parsed.seedDifficulty >= 0 && parsed.seedDifficulty <= 3
          ? (Math.floor(parsed.seedDifficulty) as SeedDifficultyTier)
          : 1;
      const randStyle =
        typeof parsed.randomStylePref === 'number' && parsed.randomStylePref >= -1 && parsed.randomStylePref <= 3
          ? Math.floor(parsed.randomStylePref)
          : -1;

      const cp = parsed.customPrefs ?? defaultCustomPrefs();
      const customPrefs: CustomModePrefs = {
        cols: typeof cp.cols === 'number' ? Math.max(5, Math.min(8, Math.floor(cp.cols))) : 6,
        rows: typeof cp.rows === 'number' ? Math.max(5, Math.min(8, Math.floor(cp.rows))) : 6,
        colorCount: typeof cp.colorCount === 'number' ? Math.max(3, Math.min(6, Math.floor(cp.colorCount))) : 5,
        theme: typeof cp.theme === 'number' ? Math.max(0, Math.min(3, Math.floor(cp.theme))) : 0,
        hearts: typeof cp.hearts === 'boolean' ? cp.hearts : true,
        rainbows: typeof cp.rainbows === 'boolean' ? cp.rainbows : true,
        hidden: typeof cp.hidden === 'boolean' ? cp.hidden : false,
        locked: typeof cp.locked === 'boolean' ? cp.locked : false,
      };

      const rawCompletedCurated = parsed.completedCurated ?? {};
      const hasExistingProgress =
        Object.keys(rawCompletedCurated).length > 0 ||
        (Array.isArray(parsed.completedDailyDates) && parsed.completedDailyDates.length > 0) ||
        (typeof parsed.mandalasCompleted === 'number' && parsed.mandalasCompleted > 0);
      const onboardingCompleted =
        typeof parsed.onboardingCompleted === 'boolean' ? parsed.onboardingCompleted : hasExistingProgress;

      // Option B migration: when upgrading from the v3 52-level testrun to the full v4 200-level
      // sawtooth catalog, start campaign level completion fresh while preserving onboarding, settings,
      // seen specials, and all Daily/Random/Custom archives.
      const savedCatalogVersion = typeof parsed.catalogVersion === 'number' ? parsed.catalogVersion : 3;
      const needsCatalogReset = savedCatalogVersion < CURRENT_CATALOG_VERSION;
      const completedCurated = needsCatalogReset ? {} : rawCompletedCurated;

      const validSpecials = new Set<SeenSpecialKind>(['heart', 'rainbow', 'hidden', 'locked']);
      const seenSpecials: SeenSpecialKind[] = Array.isArray(parsed.seenSpecials)
        ? parsed.seenSpecials.filter((k): k is SeenSpecialKind => validSpecials.has(k as SeenSpecialKind))
        : [];

      const dailyHistory: DailyCompletionRecord[] = Array.isArray(parsed.dailyHistory)
        ? parsed.dailyHistory.slice(0, 90)
        : [];
      const randomHistory: RandomCompletionRecord[] = Array.isArray(parsed.randomHistory)
        ? parsed.randomHistory.slice(0, 80)
        : [];
      const customHistory: CustomCompletionRecord[] = Array.isArray(parsed.customHistory)
        ? parsed.customHistory.slice(0, 80)
        : [];

      const loaded: GalleryProgress = {
        catalogVersion: CURRENT_CATALOG_VERSION,
        completedCurated,
        completedDailyDates: Array.isArray(parsed.completedDailyDates) ? parsed.completedDailyDates : [],
        dailyHistory,
        randomHistory,
        customHistory,
        mandalasCompleted: typeof parsed.mandalasCompleted === 'number' ? parsed.mandalasCompleted : 0,
        lastMandalaSeed: typeof parsed.lastMandalaSeed === 'number' ? parsed.lastMandalaSeed : 1,
        selectedCampaign: selCamp,
        seedDifficulty: seedDiff,
        randomStylePref: randStyle,
        customPrefs,
        onboardingCompleted,
        seenSpecials,
        settings: {
          hapticsEnabled: typeof s.hapticsEnabled === 'boolean' ? s.hapticsEnabled : true,
          timeMode: s.timeMode === 'manual' ? 'manual' : 'auto',
          manualHour: typeof s.manualHour === 'number' ? ((s.manualHour % 24) + 24) % 24 : 12.5,
        },
      };
      if (needsCatalogReset) {
        try {
          localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(loaded));
        } catch {
          // Non-fatal in private browsing
        }
      }
      return loaded;
    } catch {
      return emptyProgress();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Non-fatal in private browsing
    }
  }

  isOnboardingCompleted(): boolean {
    return this.data.onboardingCompleted;
  }

  markOnboardingCompleted(): void {
    if (!this.data.onboardingCompleted) {
      this.data.onboardingCompleted = true;
      this.save();
    }
  }

  resetOnboardingForReplay(): void {
    this.data.onboardingCompleted = false;
    this.save();
  }

  hasSeenSpecial(kind: SeenSpecialKind): boolean {
    return this.data.seenSpecials.includes(kind);
  }

  markSpecialSeen(kind: SeenSpecialKind): void {
    if (!this.data.seenSpecials.includes(kind)) {
      this.data.seenSpecials.push(kind);
      this.save();
    }
  }

  getSelectedCampaign(): number {
    return this.data.selectedCampaign;
  }

  setSelectedCampaign(campaignId: number): number {
    const clamped = Math.max(0, Math.min(3, Math.floor(campaignId)));
    this.data.selectedCampaign = clamped;
    this.save();
    return clamped;
  }

  getSeedDifficulty(): SeedDifficultyTier {
    return this.data.seedDifficulty;
  }

  setSeedDifficulty(tier: number): SeedDifficultyTier {
    const clamped = Math.max(0, Math.min(3, Math.floor(tier))) as SeedDifficultyTier;
    this.data.seedDifficulty = clamped;
    this.save();
    return clamped;
  }

  getRandomStylePref(): number {
    return this.data.randomStylePref;
  }

  setRandomStylePref(theme: number): number {
    const clamped = Math.max(-1, Math.min(3, Math.floor(theme)));
    this.data.randomStylePref = clamped;
    this.save();
    return clamped;
  }

  getCustomPrefs(): CustomModePrefs {
    return { ...this.data.customPrefs };
  }

  updateCustomPrefs(patch: Partial<CustomModePrefs>): CustomModePrefs {
    const next = { ...this.data.customPrefs, ...patch };
    next.cols = Math.max(5, Math.min(8, Math.floor(next.cols)));
    next.rows = Math.max(5, Math.min(8, Math.floor(next.rows)));
    next.colorCount = Math.max(3, Math.min(6, Math.floor(next.colorCount)));
    next.theme = Math.max(0, Math.min(3, Math.floor(next.theme)));
    this.data.customPrefs = next;
    this.save();
    return this.getCustomPrefs();
  }

  recordCompletion(
    mode: 'curated' | 'mandala' | 'daily' | 'custom',
    levelIndex: number,
    score: number,
    stars: number,
    maxStreak: number,
    meta?: {
      seed?: number;
      theme?: number;
      difficulty?: SeedDifficultyTier;
      cols?: number;
      rows?: number;
      colorCount?: number;
      specialMask?: number;
      grid?: string;
      pearls?: number;
      stitches?: [number, number, number][];
    },
  ): void {
    const today = getTodayDateKey();
    if (mode === 'curated') {
      const prev = this.data.completedCurated[levelIndex];
      this.data.completedCurated[levelIndex] = {
        bestScore: prev ? Math.max(prev.bestScore, score) : score,
        bestStars: prev ? Math.max(prev.bestStars, stars) : stars,
        bestMaxStreak: prev ? Math.max(prev.bestMaxStreak, maxStreak) : maxStreak,
        completedAt: today.label,
      };
      if (levelIndex === 0) {
        this.data.onboardingCompleted = true;
      }
    } else if (mode === 'daily') {
      const dateKey = meta?.seed && meta.seed > 10000000 ? meta.seed : today.keyNum;
      const dateLabel = formatDateKeyLabel(dateKey);
      if (!this.data.completedDailyDates.includes(dateLabel)) {
        this.data.completedDailyDates.push(dateLabel);
      }
      const existingIdx = this.data.dailyHistory.findIndex((r) => r.dateKey === dateKey);
      const prev = existingIdx >= 0 ? this.data.dailyHistory[existingIdx] : null;
      const rec: DailyCompletionRecord = {
        dateKey,
        dateLabel,
        theme: meta?.theme ?? prev?.theme ?? 0,
        bestScore: prev ? Math.max(prev.bestScore, score) : score,
        bestStars: prev ? Math.max(prev.bestStars, stars) : stars,
        bestMaxStreak: prev ? Math.max(prev.bestMaxStreak, maxStreak) : maxStreak,
        grid: meta?.grid ?? prev?.grid ?? '6×6',
        pearls: meta?.pearls ?? prev?.pearls ?? 30,
        stitches: meta?.stitches && meta.stitches.length > 0 ? meta.stitches : (prev?.stitches ?? []),
      };
      if (existingIdx >= 0) {
        this.data.dailyHistory.splice(existingIdx, 1);
      }
      this.data.dailyHistory.unshift(rec);
      if (this.data.dailyHistory.length > 90) {
        this.data.dailyHistory.length = 90;
      }
    } else if (mode === 'mandala') {
      const seed = meta?.seed || levelIndex || 1;
      const difficulty = meta?.difficulty ?? this.data.seedDifficulty;
      const theme = meta?.theme ?? 0;
      const existingIdx = this.data.randomHistory.findIndex(
        (r) => r.seed === seed && r.difficulty === difficulty && r.theme === theme,
      );
      const prev = existingIdx >= 0 ? this.data.randomHistory[existingIdx] : null;
      if (!prev) {
        this.data.mandalasCompleted++;
      }
      const rec: RandomCompletionRecord = {
        seed,
        difficulty,
        theme,
        bestScore: prev ? Math.max(prev.bestScore, score) : score,
        bestStars: prev ? Math.max(prev.bestStars, stars) : stars,
        bestMaxStreak: prev ? Math.max(prev.bestMaxStreak, maxStreak) : maxStreak,
        grid: meta?.grid ?? prev?.grid ?? '6×6',
        pearls: meta?.pearls ?? prev?.pearls ?? 30,
        completedAt: today.label,
        stitches: meta?.stitches && meta.stitches.length > 0 ? meta.stitches : (prev?.stitches ?? []),
      };
      if (existingIdx >= 0) {
        this.data.randomHistory.splice(existingIdx, 1);
      }
      this.data.randomHistory.unshift(rec);
      if (this.data.randomHistory.length > 80) {
        this.data.randomHistory.length = 80;
      }
    } else if (mode === 'custom') {
      const seed = meta?.seed || levelIndex || 1;
      const theme = meta?.theme ?? this.data.customPrefs.theme;
      const cols = meta?.cols ?? this.data.customPrefs.cols;
      const rows = meta?.rows ?? this.data.customPrefs.rows;
      const colorCount = meta?.colorCount && meta.colorCount >= 3 ? meta.colorCount : this.data.customPrefs.colorCount;
      const specialMask = typeof meta?.specialMask === 'number' ? meta.specialMask : 0;
      const existingIdx = this.data.customHistory.findIndex(
        (r) =>
          r.seed === seed &&
          r.theme === theme &&
          r.cols === cols &&
          r.rows === rows &&
          r.colorCount === colorCount &&
          r.specialMask === specialMask,
      );
      const prev = existingIdx >= 0 ? this.data.customHistory[existingIdx] : null;
      const rec: CustomCompletionRecord = {
        seed,
        theme,
        cols,
        rows,
        colorCount,
        specialMask,
        bestScore: prev ? Math.max(prev.bestScore, score) : score,
        bestStars: prev ? Math.max(prev.bestStars, stars) : stars,
        bestMaxStreak: prev ? Math.max(prev.bestMaxStreak, maxStreak) : maxStreak,
        grid: meta?.grid ?? `${cols}×${rows}`,
        pearls: meta?.pearls ?? prev?.pearls ?? 30,
        completedAt: today.label,
        stitches: meta?.stitches && meta.stitches.length > 0 ? meta.stitches : (prev?.stitches ?? []),
      };
      if (existingIdx >= 0) {
        this.data.customHistory.splice(existingIdx, 1);
      }
      this.data.customHistory.unshift(rec);
      if (this.data.customHistory.length > 80) {
        this.data.customHistory.length = 80;
      }
    }
    this.save();
  }

  getDailyHistory(): readonly DailyCompletionRecord[] {
    return this.data.dailyHistory;
  }

  getRandomHistory(): readonly RandomCompletionRecord[] {
    return this.data.randomHistory;
  }

  getCustomHistory(): readonly CustomCompletionRecord[] {
    return this.data.customHistory;
  }

  /**
   * Sequential per-campaign unlocking:
   * - Level 1 (index 0) of ALL 4 campaigns is unlocked from Day 1.
   * - Level k (k >= 1) unlocks only after Level k-1 in that same campaign is completed.
   */
  isLevelUnlocked(levelId: number, campaignLevelIds: readonly number[]): boolean {
    const pos = campaignLevelIds.indexOf(levelId);
    if (pos <= 0) return true;
    const prevId = campaignLevelIds[pos - 1];
    return Boolean(this.data.completedCurated[prevId]);
  }

  /** Returns the current playable frontier level inside a specific campaign (first uncompleted unlocked level). */
  getCampaignFrontierLevel(campaignLevelIds: readonly number[]): number {
    if (campaignLevelIds.length === 0) return 0;
    for (const id of campaignLevelIds) {
      if (!this.data.completedCurated[id]) {
        return id;
      }
    }
    return campaignLevelIds[campaignLevelIds.length - 1];
  }

  /** Returns earned vs total stars (3 per level) inside a campaign. */
  getCampaignStars(campaignLevelIds: readonly number[]): { earned: number; total: number } {
    let earned = 0;
    for (const id of campaignLevelIds) {
      const rec = this.data.completedCurated[id];
      if (rec) earned += Math.max(1, Math.min(3, rec.bestStars));
    }
    return { earned, total: campaignLevelIds.length * 3 };
  }

  /** Returns the next uncompleted curated pattern across the loaded catalog (or first level if all mastered). */
  getNextJourneyLevel(levelIds?: readonly number[]): number {
    if (levelIds && levelIds.length > 0) {
      for (const id of levelIds) {
        if (!this.data.completedCurated[id]) return id;
      }
      return levelIds[0];
    }
    for (let i = 0; i < CURATED_LEVELS.length; i++) {
      if (!this.data.completedCurated[i]) {
        return i;
      }
    }
    return 0;
  }

  /** Returns how many patterns in chapterIdx (or given levelIds) have been completed. */
  getChapterCompletion(chapterIdx: number, chapterLevelIds?: readonly number[]): { done: number; total: number } {
    if (chapterLevelIds) {
      let done = 0;
      for (const id of chapterLevelIds) {
        if (this.data.completedCurated[id]) done++;
      }
      return { done, total: chapterLevelIds.length };
    }
    const ch = CHAPTERS[chapterIdx] ?? CHAPTERS[0];
    let done = 0;
    for (let i = ch.startIndex; i < ch.startIndex + ch.count; i++) {
      if (this.data.completedCurated[i]) done++;
    }
    return { done, total: ch.count };
  }

  getSettings(): UserSettings {
    return { ...this.data.settings };
  }

  updateSettings(patch: Partial<UserSettings>): UserSettings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    return this.getSettings();
  }

  nextMandalaSeed(): number {
    this.data.lastMandalaSeed = generateRandomSeed();
    this.save();
    return this.data.lastMandalaSeed;
  }

  getSnapshot(): GalleryProgress {
    return {
      catalogVersion: this.data.catalogVersion,
      completedCurated: { ...this.data.completedCurated },
      completedDailyDates: [...this.data.completedDailyDates],
      dailyHistory: this.data.dailyHistory.map((d) => ({ ...d, stitches: [...d.stitches] })),
      randomHistory: this.data.randomHistory.map((r) => ({ ...r, stitches: [...r.stitches] })),
      customHistory: this.data.customHistory.map((c) => ({ ...c, stitches: [...c.stitches] })),
      mandalasCompleted: this.data.mandalasCompleted,
      lastMandalaSeed: this.data.lastMandalaSeed,
      selectedCampaign: this.data.selectedCampaign,
      seedDifficulty: this.data.seedDifficulty,
      randomStylePref: this.data.randomStylePref,
      customPrefs: { ...this.data.customPrefs },
      onboardingCompleted: this.data.onboardingCompleted,
      seenSpecials: [...this.data.seenSpecials],
      settings: { ...this.data.settings },
    };
  }
}
