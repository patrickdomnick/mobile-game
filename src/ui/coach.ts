import type { EmbroideryGalleryStore, SeenSpecialKind } from '../gallery';
import type { SimSnapshot } from '../wasmBridge';

export interface CoachTooltipContent {
  key: string;
  icon: string;
  title: string;
  text: string;
  anchor: 'top' | 'bottom';
  specialKind?: SeenSpecialKind;
}

const SPECIAL_ENCOUNTER_TIPS: Record<SeenSpecialKind, Omit<CoachTooltipContent, 'key' | 'anchor'>> = {
  heart: {
    icon: '♥',
    title: 'Heart Pearl',
    text: 'Stitch this sculpted heart early for up to +500 bonus points!',
    specialKind: 'heart',
  },
  rainbow: {
    icon: '🌈',
    title: 'Rainbow Pearl',
    text: 'Wild pearl—matches any active color! One matching pearl stays as a spare.',
    specialKind: 'rainbow',
  },
  hidden: {
    icon: '?',
    title: 'Hidden Pearl',
    text: 'Starts dark—its true color reveals as soon as its lane opens up.',
    specialKind: 'hidden',
  },
  locked: {
    icon: '🔒',
    title: 'Locked Pearl',
    text: 'Clear the adjacent pearls touching its 4 sides to unlock it.',
    specialKind: 'locked',
  },
};

export interface CoachTooltipDom {
  root: HTMLElement | null;
  icon: HTMLElement | null;
  title: HTMLElement | null;
  text: HTMLElement | null;
}

/**
 * Manages guided Level 1 tutorial tooltips and first-encounter Special Pearl tips
 * with clean dismissal and persistence.
 */
export class CoachTooltipController {
  private readonly dom: CoachTooltipDom;
  private readonly gallery: EmbroideryGalleryStore;
  private tutorialActive = false;
  private tutorialStep = -1;
  private dismissedKeys = new Set<string>();
  private activeTooltip: CoachTooltipContent | null = null;

  constructor(dom: CoachTooltipDom, gallery: EmbroideryGalleryStore) {
    this.dom = dom;
    this.gallery = gallery;
  }

  isTutorialActive(): boolean {
    return this.tutorialActive;
  }

  getTutorialStep(): number {
    return this.tutorialStep;
  }

  setTutorialActive(active: boolean): void {
    this.tutorialActive = active;
    if (active) {
      this.tutorialStep = 0;
      this.dismissedKeys = new Set<string>();
    }
  }

  getActiveTooltipTitle(): string | null {
    if (!this.activeTooltip || !this.dom.root || this.dom.root.classList.contains('hidden')) {
      return null;
    }
    return this.activeTooltip.title;
  }

  hasActiveSpecialTip(): boolean {
    return Boolean(this.activeTooltip?.specialKind);
  }

  hide(): void {
    this.activeTooltip = null;
    this.dom.root?.classList.add('hidden');
  }

  dismiss(): void {
    if (!this.activeTooltip) return;
    this.dismissedKeys.add(this.activeTooltip.key);
    if (this.activeTooltip.specialKind) {
      this.gallery.markSpecialSeen(this.activeTooltip.specialKind);
    }
    this.hide();
  }

  private show(content: CoachTooltipContent): void {
    if (this.activeTooltip?.key === content.key && this.dom.root && !this.dom.root.classList.contains('hidden')) {
      return;
    }
    this.activeTooltip = content;
    if (this.dom.root) {
      this.dom.root.dataset.anchor = content.anchor;
      this.dom.root.classList.remove('hidden');
    }
    if (this.dom.icon) this.dom.icon.textContent = content.icon;
    if (this.dom.title) this.dom.title.textContent = content.title;
    if (this.dom.text) this.dom.text.textContent = content.text;
  }

  evaluate(snap: SimSnapshot, isPlaying: boolean, sheetOpen: boolean): void {
    if (!isPlaying || snap.phase !== 'playing' || snap.introActive || sheetOpen) {
      this.hide();
      return;
    }

    // 1. Guided Level 1 Tutorial Tooltips
    if (this.tutorialActive && snap.mode === 'curated' && snap.levelIndex === 0) {
      let step = 0;
      let tip: CoachTooltipContent;
      if (snap.stitchedCount < 2) {
        step = 0;
        tip = {
          key: 'tut:0',
          icon: '✦',
          title: 'Match the active colors',
          text: 'Tap pearls on the board that match the glowing colors at top-left.',
          anchor: 'top',
        };
      } else if (snap.stitchedCount < 6) {
        step = 1;
        tip = {
          key: 'tut:1',
          icon: '↗',
          title: 'Follow each arrow & tray',
          text: 'Pearls slide in their arrow direction. Other colors wait safely in the 5-slot tray.',
          anchor: 'top',
        };
      } else {
        step = 2;
        tip = {
          key: 'tut:2',
          icon: '↶',
          title: 'Undo, Hint & Restart',
          text: 'Use the controls below anytime to step back, see the smartest move, or restart.',
          anchor: 'bottom',
        };
      }
      this.tutorialStep = step;
      if (!this.dismissedKeys.has(tip.key)) {
        this.show(tip);
      } else {
        this.hide();
      }
      return;
    }

    // 2. First-Encounter Special Pearl Tooltips (shown once per pearl type!)
    const order: SeenSpecialKind[] = ['heart', 'rainbow', 'hidden', 'locked'];
    for (const kind of order) {
      if (this.gallery.hasSeenSpecial(kind)) continue;
      const present = snap.tiles.some((t) => t.alive && t.special === kind);
      if (present) {
        const spec = SPECIAL_ENCOUNTER_TIPS[kind];
        const key = `special:${kind}`;
        if (!this.dismissedKeys.has(key)) {
          this.show({
            key,
            icon: spec.icon,
            title: spec.title,
            text: spec.text,
            anchor: 'top',
            specialKind: kind,
          });
          return;
        }
      }
    }

    this.hide();
  }
}
