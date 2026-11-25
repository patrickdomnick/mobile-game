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
  selectedCampaign: number;
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
    selectedCampaign: 0,
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
      const selCamp =
        typeof parsed.selectedCampaign === 'number' && parsed.selectedCampaign >= 0 && parsed.selectedCampaign < 4
          ? Math.floor(parsed.selectedCampaign)
          : 0;
      return {
        completedCurated: parsed.completedCurated ?? {},
        completedDailyDates: Array.isArray(parsed.completedDailyDates) ? parsed.completedDailyDates : [],
        mandalasCompleted: typeof parsed.mandalasCompleted === 'number' ? parsed.mandalasCompleted : 0,
        lastMandalaSeed: typeof parsed.lastMandalaSeed === 'number' ? parsed.lastMandalaSeed : 1,
        selectedCampaign: selCamp,
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

  getSelectedCampaign(): number {
    return this.data.selectedCampaign;
  }

  setSelectedCampaign(campaignId: number): number {
    const clamped = Math.max(0, Math.min(3, Math.floor(campaignId)));
    this.data.selectedCampaign = clamped;
    this.save();
    return clamped;
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
      completedCurated: { ...this.data.completedCurated },
      completedDailyDates: [...this.data.completedDailyDates],
      mandalasCompleted: this.data.mandalasCompleted,
      lastMandalaSeed: this.data.lastMandalaSeed,
      selectedCampaign: this.data.selectedCampaign,
      settings: { ...this.data.settings },
    };
  }
}
