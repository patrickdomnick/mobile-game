import { CHAPTERS, CURATED_LEVELS, generateRandomSeed } from './wasmBridge';

const GALLERY_STORAGE_KEY = 'pearl-loom-gallery-v2';

export interface CuratedCompletionRecord {
  bestScore: number;
  bestStars: number;
  bestMaxStreak: number;
  completedAt: string;
}

export interface UserSettings {
  hapticsEnabled: boolean;
  timeMode: 'auto' | 'manual';
  manualHour: number;
}

export interface GalleryProgress {
  completedCurated: Record<number, CuratedCompletionRecord>;
  completedDailyDates: string[];
  mandalasCompleted: number;
  lastMandalaSeed: number;
  settings: UserSettings;
}

function defaultSettings(): UserSettings {
  return {
    hapticsEnabled: true,
    timeMode: 'auto',
    manualHour: 12.5,
  };
}

function emptyProgress(): GalleryProgress {
  return {
    completedCurated: {},
    completedDailyDates: [],
    mandalasCompleted: 0,
    lastMandalaSeed: 1,
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
      return {
        completedCurated: parsed.completedCurated ?? {},
        completedDailyDates: Array.isArray(parsed.completedDailyDates) ? parsed.completedDailyDates : [],
        mandalasCompleted: typeof parsed.mandalasCompleted === 'number' ? parsed.mandalasCompleted : 0,
        lastMandalaSeed: typeof parsed.lastMandalaSeed === 'number' ? parsed.lastMandalaSeed : 1,
        settings: {
          hapticsEnabled: typeof s.hapticsEnabled === 'boolean' ? s.hapticsEnabled : true,
          timeMode: s.timeMode === 'manual' ? 'manual' : 'auto',
          manualHour: typeof s.manualHour === 'number' ? ((s.manualHour % 24) + 24) % 24 : 12.5,
        },
      };
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

  recordCompletion(
    mode: 'curated' | 'mandala' | 'daily',
    levelIndex: number,
    score: number,
    stars: number,
    maxStreak: number,
  ): void {
    const today = getTodayDateKey().label;
    if (mode === 'curated') {
      const prev = this.data.completedCurated[levelIndex];
      this.data.completedCurated[levelIndex] = {
        bestScore: prev ? Math.max(prev.bestScore, score) : score,
        bestStars: prev ? Math.max(prev.bestStars, stars) : stars,
        bestMaxStreak: prev ? Math.max(prev.bestMaxStreak, maxStreak) : maxStreak,
        completedAt: today,
      };
    } else if (mode === 'daily') {
      if (!this.data.completedDailyDates.includes(today)) {
        this.data.completedDailyDates.push(today);
      }
    } else {
      this.data.mandalasCompleted++;
    }
    this.save();
  }

  /** Returns the next uncompleted curated pattern across Chapters I-V (or 0 if all 40 mastered). */
  getNextJourneyLevel(): number {
    for (let i = 0; i < CURATED_LEVELS.length; i++) {
      if (!this.data.completedCurated[i]) {
        return i;
      }
    }
    return 0;
  }

  /** Returns how many of the 8 patterns in chapterIdx have been completed. */
  getChapterCompletion(chapterIdx: number): { done: number; total: number } {
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
      completedCurated: { ...this.data.completedCurated },
      completedDailyDates: [...this.data.completedDailyDates],
      mandalasCompleted: this.data.mandalasCompleted,
      lastMandalaSeed: this.data.lastMandalaSeed,
      settings: { ...this.data.settings },
    };
  }
}
