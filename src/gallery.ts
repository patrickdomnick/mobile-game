const GALLERY_STORAGE_KEY = 'pearl-loom-gallery-v1';

export interface GalleryProgress {
  completedCurated: Record<number, { bestMoves: number; completedAt: string }>;
  completedDailyDates: string[];
  mandalasCompleted: number;
  lastMandalaSeed: number;
}

function emptyProgress(): GalleryProgress {
  return {
    completedCurated: {},
    completedDailyDates: [],
    mandalasCompleted: 0,
    lastMandalaSeed: 1,
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
      return {
        completedCurated: parsed.completedCurated ?? {},
        completedDailyDates: Array.isArray(parsed.completedDailyDates) ? parsed.completedDailyDates : [],
        mandalasCompleted: typeof parsed.mandalasCompleted === 'number' ? parsed.mandalasCompleted : 0,
        lastMandalaSeed: typeof parsed.lastMandalaSeed === 'number' ? parsed.lastMandalaSeed : 1,
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

  recordCompletion(mode: 'curated' | 'mandala' | 'daily', levelIndex: number, moves: number): void {
    const today = getTodayDateKey().label;
    if (mode === 'curated') {
      const prev = this.data.completedCurated[levelIndex];
      const bestMoves = prev ? Math.min(prev.bestMoves, moves) : moves;
      this.data.completedCurated[levelIndex] = { bestMoves, completedAt: today };
    } else if (mode === 'daily') {
      if (!this.data.completedDailyDates.includes(today)) {
        this.data.completedDailyDates.push(today);
      }
    } else {
      this.data.mandalasCompleted++;
    }
    this.save();
  }

  nextMandalaSeed(): number {
    this.data.lastMandalaSeed = (this.data.lastMandalaSeed % 9999) + 1;
    this.save();
    return this.data.lastMandalaSeed;
  }

  getSnapshot(): GalleryProgress {
    return {
      completedCurated: { ...this.data.completedCurated },
      completedDailyDates: [...this.data.completedDailyDates],
      mandalasCompleted: this.data.mandalasCompleted,
      lastMandalaSeed: this.data.lastMandalaSeed,
    };
  }
}
