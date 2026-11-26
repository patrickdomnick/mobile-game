import type { ProceduralSoundscape } from '../audio/soundscape';
import {
  EmbroideryGalleryStore,
  getTodayDateKey,
  type CustomModePrefs,
} from '../gallery';
import { getLevelTierLabel, type LevelsCatalog, type RemoteLevelDef } from '../levels';
import {
  SEED_DIFFICULTIES,
  SPECIAL_MASK,
  VISUAL_THEMES,
  getDailyThemeForDateKey,
  getThemePalette,
  type SeedDifficultyTier,
} from '../wasmBridge';
import { createEmptyArchiveCard, createSquareArchiveCard } from './cards';

export type SheetName = 'none' | 'gallery' | 'daily-library' | 'random' | 'custom' | 'settings' | 'install';

export function customPrefsToMask(p: CustomModePrefs): number {
  let mask = 0;
  if (p.hearts) mask |= SPECIAL_MASK.HEART;
  if (p.rainbows) mask |= SPECIAL_MASK.RAINBOW;
  if (p.hidden) mask |= SPECIAL_MASK.HIDDEN;
  if (p.locked) mask |= SPECIAL_MASK.LOCKED;
  return mask;
}

export interface SheetsHostCallbacks {
  getHapticsEnabled(): boolean;
  onSelectCampaignTheme(themeId: number): void;
  onLaunchCurated(levelId: number): void;
  onLaunchDaily(dateKey: number): void;
  onLaunchRandom(seed: number, diff: SeedDifficultyTier, theme: number): void;
  onLaunchCustom(opts: {
    seed: number;
    theme: number;
    cols: number;
    rows: number;
    colorCount: number;
    specialMask: number;
  }): void;
}

/**
 * Owns Start Menu copy, Level Select, Daily Library, Random Studio, and Custom Mode sheets,
 * sharing a single DRY square embroidery card factory (`src/ui/cards.ts`).
 */
export class MenuSheetsController {
  private readonly gallery: EmbroideryGalleryStore;
  private readonly levelsCatalog: LevelsCatalog;
  private readonly soundscape: ProceduralSoundscape;
  private readonly host: SheetsHostCallbacks;

  private activeGalleryChapter: number;

  // Sheet roots
  readonly gallerySheet = document.getElementById('overlay-gallery');
  readonly dailyLibrarySheet = document.getElementById('overlay-daily-library');
  readonly randomSheet = document.getElementById('overlay-random');
  readonly customSheet = document.getElementById('overlay-custom');
  readonly settingsSheet = document.getElementById('overlay-settings');
  readonly installModal = document.getElementById('overlay-install');

  // Start menu dynamic labels
  private readonly menuChapterLabel = document.getElementById('menu-chapter-label');
  private readonly menuJourneyBadge = document.getElementById('menu-journey-badge');
  private readonly menuJourneyMain = document.getElementById('menu-journey-main');
  private readonly menuJourneyMeta = document.getElementById('menu-journey-meta');
  private readonly menuDailyBadge = document.getElementById('menu-daily-badge');
  private readonly menuDailyMeta = document.getElementById('menu-daily-meta');
  private readonly menuDailyLibMeta = document.getElementById('menu-daily-lib-meta');
  private readonly menuRandomMeta = document.getElementById('menu-random-meta');
  private readonly menuCustomMeta = document.getElementById('menu-custom-meta');
  private readonly menuGalleryLabel = document.getElementById('menu-gallery-label');

  // Level Select refs
  private readonly galleryEyebrowEl = document.getElementById('gallery-eyebrow');
  private readonly chapterTabsEl = document.getElementById('chapter-tabs');
  private readonly chapterBannerTitle = document.getElementById('chapter-banner-title');
  private readonly chapterBannerSub = document.getElementById('chapter-banner-sub');
  private readonly chapterBannerProgress = document.getElementById('chapter-banner-progress');
  private readonly chapterBannerStars = document.getElementById('chapter-banner-stars');
  private readonly chapterProgressBar = document.getElementById('chapter-progress-bar');
  private readonly chapterTierPillsEl = document.getElementById('chapter-tier-pills');
  private readonly galleryGridEl = document.getElementById('gallery-grid');

  // Daily Library refs
  private readonly dailyLibEyebrowEl = document.getElementById('daily-lib-eyebrow');
  private readonly dailyLibTodayTitle = document.getElementById('daily-lib-today-title');
  private readonly dailyLibTodaySub = document.getElementById('daily-lib-today-sub');
  private readonly dailyLibPlayTodayBtn = document.getElementById('btn-daily-lib-play-today');
  private readonly dailyLibraryGridEl = document.getElementById('daily-library-grid');

  // Random Studio refs
  private readonly randomStylePickerEl = document.getElementById('random-style-picker');
  private readonly seedDiffPickerEl = document.getElementById('seed-diff-picker');
  private readonly randomStartBadge = document.getElementById('random-start-badge');
  private readonly randomArchiveHeading = document.getElementById('random-archive-heading');
  private readonly randomHistoryGridEl = document.getElementById('random-history-grid');

  // Custom Builder refs
  private readonly customStylePickerEl = document.getElementById('custom-style-picker');
  private readonly customSizeReadoutEl = document.getElementById('custom-size-readout');
  private readonly customColsPickerEl = document.getElementById('custom-cols-picker');
  private readonly customRowsPickerEl = document.getElementById('custom-rows-picker');
  private readonly customColorPreviewEl = document.getElementById('custom-color-preview');
  private readonly customColorsPickerEl = document.getElementById('custom-colors-picker');
  private readonly customSpecialsPickerEl = document.getElementById('custom-specials-picker');
  private readonly customStartBadge = document.getElementById('custom-start-badge');
  private readonly customArchiveHeading = document.getElementById('custom-archive-heading');
  private readonly customHistoryGridEl = document.getElementById('custom-history-grid');

  constructor(
    gallery: EmbroideryGalleryStore,
    levelsCatalog: LevelsCatalog,
    soundscape: ProceduralSoundscape,
    host: SheetsHostCallbacks,
  ) {
    this.gallery = gallery;
    this.levelsCatalog = levelsCatalog;
    this.soundscape = soundscape;
    this.host = host;
    this.activeGalleryChapter = gallery.getSelectedCampaign();
  }

  getActiveGalleryChapter(): number {
    return this.activeGalleryChapter;
  }

  setActiveGalleryChapter(chapterId: number): void {
    this.activeGalleryChapter = chapterId;
  }

  getCampaignById(campaignId: number) {
    return this.levelsCatalog.chapters.find((c) => c.id === campaignId) ?? this.levelsCatalog.chapters[0];
  }

  findCatalogLevel(levelId: number): RemoteLevelDef {
    return (
      this.levelsCatalog.levels.find((l) => l.id === levelId) ??
      this.levelsCatalog.levels[levelId % Math.max(1, this.levelsCatalog.levels.length)] ??
      this.levelsCatalog.levels[0]
    );
  }

  getActiveSheet(): SheetName {
    if (this.gallerySheet && !this.gallerySheet.classList.contains('hidden')) return 'gallery';
    if (this.dailyLibrarySheet && !this.dailyLibrarySheet.classList.contains('hidden')) return 'daily-library';
    if (this.randomSheet && !this.randomSheet.classList.contains('hidden')) return 'random';
    if (this.customSheet && !this.customSheet.classList.contains('hidden')) return 'custom';
    if (this.settingsSheet && !this.settingsSheet.classList.contains('hidden')) return 'settings';
    if (this.installModal && !this.installModal.classList.contains('hidden')) return 'install';
    return 'none';
  }

  isAnySheetOpen(): boolean {
    return this.getActiveSheet() !== 'none';
  }

  closeAll(): void {
    this.gallerySheet?.classList.add('hidden');
    this.dailyLibrarySheet?.classList.add('hidden');
    this.randomSheet?.classList.add('hidden');
    this.customSheet?.classList.add('hidden');
    this.settingsSheet?.classList.add('hidden');
    this.installModal?.classList.add('hidden');
  }

  refreshAll(): void {
    this.refreshStartMenuCopy();
    this.renderGalleryUi();
    this.renderDailyLibraryUi();
    this.renderRandomStudioUi();
    this.renderCustomBuilderUi();
  }

  refreshStartMenuCopy(): void {
    const selectedId = this.gallery.getSelectedCampaign();
    const ch = this.getCampaignById(selectedId);
    const frontierId = this.gallery.getCampaignFrontierLevel(ch.levelIds);
    const frontierLvl = this.findCatalogLevel(frontierId);
    const chProg = this.gallery.getChapterCompletion(ch.id, ch.levelIds);
    const frontierPos = Math.max(0, ch.levelIds.indexOf(frontierId)) + 1;
    const allCompleted = chProg.done >= chProg.total && chProg.total > 0;
    const tierLabel = getLevelTierLabel(frontierLvl);

    const prog = this.gallery.getSnapshot();
    const totalDone = Object.keys(prog.completedCurated).length;
    const today = getTodayDateKey();
    const dailyTheme = getDailyThemeForDateKey(today.keyNum);
    const dailyDone = prog.completedDailyDates.includes(today.label);
    const diffDef = SEED_DIFFICULTIES[prog.seedDifficulty] ?? SEED_DIFFICULTIES[1];
    const cp = prog.customPrefs;

    if (this.menuChapterLabel) {
      this.menuChapterLabel.textContent = `${this.levelsCatalog.chapters.length} CAMPAIGNS · ${totalDone}/${this.levelsCatalog.levels.length} MASTERED`;
    }
    if (this.menuJourneyBadge) {
      this.menuJourneyBadge.textContent = allCompleted
        ? `${ch.name.toUpperCase()} · MASTERED ✦`
        : `${ch.name.toUpperCase()} · LEVEL ${frontierPos} OF ${chProg.total}`;
    }
    if (this.menuJourneyMain) {
      this.menuJourneyMain.textContent = allCompleted ? `Replay ${frontierLvl.name}` : `Play ${frontierLvl.name}`;
    }
    if (this.menuJourneyMeta) {
      this.menuJourneyMeta.textContent = frontierLvl.noBlockers
        ? `${frontierLvl.grid} · ${tierLabel} · No Blockers`
        : `${frontierLvl.grid} · ${tierLabel} · ${frontierLvl.pearls} pearls`;
    }
    if (this.menuDailyBadge) {
      this.menuDailyBadge.textContent = `TODAY · ${dailyTheme.shortName.toUpperCase()}`;
    }
    if (this.menuDailyMeta) {
      this.menuDailyMeta.textContent = dailyDone ? `✦ Completed (${today.label})` : today.label;
    }
    if (this.menuDailyLibMeta) {
      const cnt = prog.dailyHistory.length;
      this.menuDailyLibMeta.textContent = cnt === 1 ? '1 stitch saved' : `${cnt} stitches saved`;
    }
    if (this.menuRandomMeta) {
      this.menuRandomMeta.textContent = `${diffDef.name} ${diffDef.grid} · ${prog.randomHistory.length} done`;
    }
    if (this.menuCustomMeta) {
      this.menuCustomMeta.textContent =
        prog.customHistory.length > 0
          ? `${cp.cols}×${cp.rows} · ${prog.customHistory.length} done`
          : `${cp.cols}×${cp.rows} · ${cp.colorCount} colors`;
    }
    if (this.menuGalleryLabel) {
      this.menuGalleryLabel.textContent = `Level Select · ${totalDone}/${this.levelsCatalog.levels.length} Mastered`;
    }
  }

  renderGalleryUi(): void {
    const prog = this.gallery.getSnapshot();
    const activeCh = this.getCampaignById(this.activeGalleryChapter);

    if (this.gallerySheet) {
      this.gallerySheet.dataset.viewTheme = String(activeCh.themeId);
    }
    if (this.galleryEyebrowEl) {
      this.galleryEyebrowEl.textContent = `${this.levelsCatalog.chapters.length} CAMPAIGNS · ${this.levelsCatalog.levels.length} LEVELS`;
    }

    if (this.chapterTabsEl) {
      this.chapterTabsEl.innerHTML = '';
      this.levelsCatalog.chapters.forEach((ch) => {
        const theme = VISUAL_THEMES[ch.themeId] ?? VISUAL_THEMES[0];
        const chProg = this.gallery.getChapterCompletion(ch.id, ch.levelIds);
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `chapter-tab${this.activeGalleryChapter === ch.id ? ' is-active' : ''}`;
        tab.dataset.chapterId = String(ch.id);
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', this.activeGalleryChapter === ch.id ? 'true' : 'false');

        const orb = document.createElement('span');
        orb.className = 'chapter-tab-orb';
        orb.style.background = theme.swatchGradient;

        const lbl = document.createElement('span');
        lbl.textContent = ch.shortName;

        const cnt = document.createElement('span');
        cnt.className = 'gallery-meta';
        cnt.textContent = `${chProg.done}/${chProg.total}`;

        tab.append(orb, lbl, cnt);
        tab.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.activeGalleryChapter = ch.id;
          this.gallery.setSelectedCampaign(ch.id);
          this.host.onSelectCampaignTheme(ch.themeId);
          this.refreshStartMenuCopy();
          this.renderGalleryUi();
        });
        this.chapterTabsEl!.append(tab);
      });
    }

    const chProg = this.gallery.getChapterCompletion(activeCh.id, activeCh.levelIds);
    const chStars = this.gallery.getCampaignStars(activeCh.levelIds);
    const frontierId = this.gallery.getCampaignFrontierLevel(activeCh.levelIds);

    if (this.chapterBannerTitle) this.chapterBannerTitle.textContent = activeCh.name;
    if (this.chapterBannerSub) this.chapterBannerSub.textContent = activeCh.subtitle;
    if (this.chapterBannerProgress) this.chapterBannerProgress.textContent = `${chProg.done}/${chProg.total}`;
    if (this.chapterBannerStars) this.chapterBannerStars.textContent = `★ ${chStars.earned}/${chStars.total}`;
    if (this.chapterProgressBar) {
      const pct = chProg.total > 0 ? Math.round((chProg.done / chProg.total) * 100) : 0;
      this.chapterProgressBar.style.width = `${pct}%`;
    }

    if (!this.galleryGridEl) return;
    this.galleryGridEl.innerHTML = '';

    const pal = getThemePalette(activeCh.themeId);
    const chapterLevels = this.levelsCatalog.levels.filter((l) => l.chapter === activeCh.id);
    const tierMeta: ReadonlyArray<{ pill: string; heading: string; sub: string }> = [
      { pill: '5×5', heading: 'TIER 1 · 5×5', sub: 'Warm-Up & Hearts' },
      { pill: '6×5', heading: 'TIER 2 · 6×5', sub: 'Expanded Loom' },
      { pill: '6×6', heading: 'TIER 3 · 6×6', sub: 'Fun Shape · + 🌈 Rainbow' },
      { pill: '7×6', heading: 'TIER 4 · 7×6', sub: 'Six-Color Ramp' },
      { pill: '7×7', heading: 'TIER 5 · 7×7', sub: 'Fun Shape · + ? Hidden' },
      { pill: '8×6', heading: 'TIER 6 · 8×6', sub: 'Wide Corridors' },
      { pill: '8×7', heading: 'TIER 7 · 8×7', sub: '+ 🔒 Locked Pearls' },
      { pill: '8×8 I', heading: 'TIER 8 · 8×8 STANDARD', sub: 'Fun Shape · Full Suite' },
      { pill: '8×8 II', heading: 'TIER 9 · 8×8 EXPERT', sub: 'Fun Shape · Expert' },
      { pill: '8×8 III', heading: 'TIER 10 · 8×8 MASTER', sub: 'Fun Shape · Grand 64' },
    ];

    const tierCount = Math.ceil(chapterLevels.length / 5);
    const frontierPosInCamp = Math.max(0, activeCh.levelIds.indexOf(frontierId));
    const frontierTierIdx = Math.floor(frontierPosInCamp / 5);

    if (this.chapterTierPillsEl) {
      this.chapterTierPillsEl.innerHTML = '';
      for (let t = 0; t < tierCount; t++) {
        const slice = chapterLevels.slice(t * 5, (t + 1) * 5);
        const doneInTier = slice.filter((l) => Boolean(prog.completedCurated[l.id])).length;
        const meta = tierMeta[t] ?? {
          pill: slice[0]?.grid ?? `T${t + 1}`,
          heading: `TIER ${t + 1} · ${slice[0]?.grid ?? ''}`,
          sub: '',
        };
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `tier-pill${t === frontierTierIdx ? ' is-frontier' : ''}${doneInTier === slice.length && slice.length > 0 ? ' is-done' : ''}`;
        pill.dataset.tierIdx = String(t);

        const lbl = document.createElement('span');
        lbl.textContent = meta.pill;

        const cnt = document.createElement('span');
        cnt.className = 'tier-pill-count';
        cnt.textContent = doneInTier === slice.length && slice.length > 0 ? '✓' : `${doneInTier}/${slice.length}`;

        pill.append(lbl, cnt);
        pill.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          const anchor = this.galleryGridEl?.querySelector(`[data-tier-anchor="${t}"]`);
          anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        this.chapterTierPillsEl.append(pill);
      }
    }

    chapterLevels.forEach((lvl, idxInCamp) => {
      if (idxInCamp % 5 === 0) {
        const t = Math.floor(idxInCamp / 5);
        const slice = chapterLevels.slice(idxInCamp, idxInCamp + 5);
        const doneInTier = slice.filter((l) => Boolean(prog.completedCurated[l.id])).length;
        const meta = tierMeta[t] ?? {
          pill: lvl.grid,
          heading: `TIER ${t + 1} · ${lvl.grid}`,
          sub: '',
        };
        const header = document.createElement('div');
        header.className = 'gallery-tier-header';
        header.dataset.tierAnchor = String(t);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'gallery-tier-title';
        titleSpan.textContent = meta.heading;

        const subSpan = document.createElement('span');
        subSpan.className = 'gallery-tier-sub';
        subSpan.textContent = `${meta.sub} · ${doneInTier}/${slice.length}`;

        header.append(titleSpan, subSpan);
        this.galleryGridEl!.append(header);
      }

      const done = prog.completedCurated[lvl.id];
      const unlocked = this.gallery.isLevelUnlocked(lvl.id, activeCh.levelIds);
      const isCurrent = unlocked && !done && lvl.id === frontierId;
      const tierLabel = getLevelTierLabel(lvl);

      const specIcons: string[] = [];
      if ((lvl.maxHearts ?? 0) > 0) specIcons.push('♥');
      if ((lvl.maxRainbows ?? 0) > 0) specIcons.push('🌈');
      if ((lvl.maxHidden ?? 0) > 0) specIcons.push('?');
      if ((lvl.maxLocked ?? 0) > 0) specIcons.push('🔒');

      const card = createSquareArchiveCard({
        badgeLeft: `LVL ${String(idxInCamp + 1).padStart(2, '0')}`,
        badgeRight: `${lvl.grid} · ${tierLabel}`,
        statusText: done ? '★'.repeat(Math.max(1, done.bestStars)) : isCurrent ? 'PLAY' : '🔒',
        statusClass: done ? 'gallery-star' : isCurrent ? 'gallery-play-chip' : 'gallery-lock-chip',
        title: lvl.name,
        scoreLabel: done ? `${done.bestScore.toLocaleString()} pts` : `${lvl.pearls} pearls`,
        stitches: lvl.stitches,
        themeId: activeCh.themeId,
        completed: Boolean(done),
        current: isCurrent,
        locked: !unlocked,
        lockOverlayText: `🔒 Clear Level ${idxInCamp}`,
        paletteDots: lvl.colors.map((cIdx) => (pal[cIdx] ?? pal[0]).hex),
        footerRightText: specIcons.length > 0 ? specIcons.join(' ') : lvl.noBlockers ? 'No Blockers' : 'Classic Pearls',
        footerRightClass: specIcons.length > 0 ? 'square-card-specials' : 'square-card-sub',
        dataset: { levelIndex: String(lvl.id), locked: unlocked ? 'false' : 'true' },
        onClick: (btn) => {
          this.soundscape.unlock();
          if (!unlocked) {
            btn.classList.remove('locked-shake');
            void btn.offsetWidth;
            btn.classList.add('locked-shake');
            this.soundscape.playUiTap(this.host.getHapticsEnabled());
            return;
          }
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.host.onLaunchCurated(lvl.id);
        },
      });
      this.galleryGridEl!.append(card);
    });
  }

  /** Scrolls Level Select directly to the active frontier card when opening mid-campaign. */
  scrollGalleryToFrontier(): void {
    if (!this.galleryGridEl) return;
    const currentCard = this.galleryGridEl.querySelector('.square-level-card.is-current') as HTMLElement | null;
    if (currentCard) {
      // Only scroll down once past the first few cards so early players see the full header & tier pills
      const idx = Number(currentCard.dataset.levelIndex ?? '0') % 50;
      if (idx >= 3) {
        currentCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      } else if (this.gallerySheet) {
        this.gallerySheet.scrollTop = 0;
      }
    }
  }

  renderDailyLibraryUi(): void {
    const today = getTodayDateKey();
    const dailyTheme = getDailyThemeForDateKey(today.keyNum);
    const history = this.gallery.getDailyHistory();
    const doneToday = history.some((d) => d.dateKey === today.keyNum);

    if (this.dailyLibEyebrowEl) {
      this.dailyLibEyebrowEl.textContent = `${history.length} DAILY STITCH${history.length === 1 ? '' : 'ES'} SAVED`;
    }
    if (this.dailyLibTodayTitle) this.dailyLibTodayTitle.textContent = `Today · ${today.label}`;
    if (this.dailyLibTodaySub) {
      this.dailyLibTodaySub.textContent = doneToday
        ? `✦ Completed · ${dailyTheme.name} (6×6)`
        : `${dailyTheme.name} · 6×6 · ♥ 🌈`;
    }
    if (this.dailyLibPlayTodayBtn) {
      this.dailyLibPlayTodayBtn.textContent = doneToday ? 'Replay Today' : 'Play Today';
    }

    if (!this.dailyLibraryGridEl) return;
    this.dailyLibraryGridEl.innerHTML = '';

    if (history.length === 0) {
      this.dailyLibraryGridEl.append(
        createEmptyArchiveCard(
          '✦',
          'No Daily Stitches Yet',
          "Complete today's Daily Stitch and your finished embroidery will appear here to admire or replay anytime.",
        ),
      );
      return;
    }

    for (const rec of history) {
      const theme = VISUAL_THEMES[rec.theme] ?? VISUAL_THEMES[0];
      const card = createSquareArchiveCard({
        badgeLeft: rec.dateLabel,
        badgeRight: `${theme.shortName} · ${rec.grid}`,
        statusText: '★'.repeat(Math.max(1, rec.bestStars)),
        statusClass: 'gallery-star',
        title: `Daily #${rec.dateKey}`,
        scoreLabel: `${rec.bestScore.toLocaleString()} pts`,
        stitches: rec.stitches,
        themeId: rec.theme,
        completed: true,
        footerLeftSub: `${rec.pearls} pearls · Best ${rec.bestMaxStreak}× streak`,
        footerRightText: 'REPLAY',
        footerRightClass: 'gallery-play-chip',
        dataset: { dailyDateKey: String(rec.dateKey) },
        onClick: () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.host.onLaunchDaily(rec.dateKey);
        },
      });
      this.dailyLibraryGridEl.append(card);
    }
  }

  renderRandomStudioUi(): void {
    const stylePref = this.gallery.getRandomStylePref();
    const diffPref = this.gallery.getSeedDifficulty();
    const diffDef = SEED_DIFFICULTIES[diffPref] ?? SEED_DIFFICULTIES[1];
    const history = this.gallery.getRandomHistory();

    if (this.randomSheet) {
      const viewTheme = stylePref >= 0 ? stylePref : this.gallery.getSelectedCampaign();
      this.randomSheet.dataset.viewTheme = String(viewTheme);
    }
    if (this.randomStartBadge) {
      const styleName = stylePref < 0 ? 'RANDOM STYLE' : (VISUAL_THEMES[stylePref]?.shortName.toUpperCase() ?? 'JEWEL');
      this.randomStartBadge.textContent = `${styleName} · ${diffDef.name.toUpperCase()} ${diffDef.grid}`;
    }

    if (this.randomStylePickerEl) {
      this.randomStylePickerEl.innerHTML = '';
      const options = [
        { id: -1, label: 'Auto', grad: 'conic-gradient(from 0deg, #ff3b8d, #ffd83d, #2ce8a2, #29b6ff, #ff3b8d)' },
        ...VISUAL_THEMES.map((t) => ({ id: t.id, label: t.shortName, grad: t.swatchGradient })),
      ];
      for (const opt of options) {
        const isAct = opt.id === stylePref;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `style-pill-btn${isAct ? ' is-active' : ''}`;
        btn.dataset.randomStyle = String(opt.id);
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', isAct ? 'true' : 'false');

        const orb = document.createElement('span');
        orb.className = 'chapter-tab-orb';
        orb.style.background = opt.grad;

        const lbl = document.createElement('span');
        lbl.textContent = opt.label;

        btn.append(orb, lbl);
        btn.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.gallery.setRandomStylePref(opt.id);
          this.renderRandomStudioUi();
        });
        this.randomStylePickerEl.append(btn);
      }
    }

    if (this.seedDiffPickerEl) {
      this.seedDiffPickerEl.innerHTML = '';
      SEED_DIFFICULTIES.forEach((tier) => {
        const isAct = tier.id === diffPref;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `seed-diff-pill${isAct ? ' is-active' : ''}`;
        pill.dataset.seedDifficulty = String(tier.id);
        pill.setAttribute('role', 'radio');
        pill.setAttribute('aria-checked', isAct ? 'true' : 'false');

        const nSpan = document.createElement('span');
        nSpan.className = 'seed-diff-name';
        nSpan.textContent = tier.name;

        const gSpan = document.createElement('span');
        gSpan.className = 'seed-diff-grid';
        gSpan.textContent = tier.grid;

        const iSpan = document.createElement('span');
        iSpan.className = 'seed-diff-icons';
        iSpan.textContent = tier.specials;

        pill.append(nSpan, gSpan, iSpan);
        pill.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.gallery.setSeedDifficulty(tier.id);
          this.refreshStartMenuCopy();
          this.renderRandomStudioUi();
        });
        this.seedDiffPickerEl!.append(pill);
      });
    }

    if (this.randomArchiveHeading) {
      this.randomArchiveHeading.textContent = `COMPLETED RANDOM PATTERNS (${history.length})`;
    }
    if (!this.randomHistoryGridEl) return;
    this.randomHistoryGridEl.innerHTML = '';

    if (history.length === 0) {
      this.randomHistoryGridEl.append(
        createEmptyArchiveCard(
          '❖',
          'Your Random Archive',
          'Pick a style and difficulty above (or type any seed) to play—completed embroideries are saved here.',
        ),
      );
      return;
    }

    for (const rec of history) {
      const theme = VISUAL_THEMES[rec.theme] ?? VISUAL_THEMES[0];
      const tier = SEED_DIFFICULTIES[rec.difficulty] ?? SEED_DIFFICULTIES[1];
      const card = createSquareArchiveCard({
        badgeLeft: tier.name.toUpperCase(),
        badgeRight: `${theme.shortName} · ${rec.grid}`,
        statusText: '★'.repeat(Math.max(1, rec.bestStars)),
        statusClass: 'gallery-star',
        title: `Seed #${rec.seed}`,
        scoreLabel: `${rec.bestScore.toLocaleString()} pts`,
        stitches: rec.stitches,
        themeId: rec.theme,
        completed: true,
        footerLeftSub: `${rec.pearls} pearls · ${rec.completedAt}`,
        footerRightText: 'REPLAY',
        footerRightClass: 'gallery-play-chip',
        dataset: { randomSeed: String(rec.seed) },
        onClick: () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.host.onLaunchRandom(rec.seed, rec.difficulty, rec.theme);
        },
      });
      this.randomHistoryGridEl.append(card);
    }
  }

  renderCustomBuilderUi(): void {
    const prefs = this.gallery.getCustomPrefs();
    const theme = VISUAL_THEMES[prefs.theme] ?? VISUAL_THEMES[0];
    const pal = getThemePalette(prefs.theme);

    if (this.customSheet) this.customSheet.dataset.viewTheme = String(prefs.theme);
    if (this.customSizeReadoutEl) this.customSizeReadoutEl.textContent = `${prefs.cols} × ${prefs.rows}`;
    if (this.customStartBadge) {
      this.customStartBadge.textContent = `${theme.shortName.toUpperCase()} · ${prefs.cols}×${prefs.rows} · ${prefs.colorCount} COLORS`;
    }

    if (this.customStylePickerEl) {
      this.customStylePickerEl.innerHTML = '';
      VISUAL_THEMES.forEach((t) => {
        const isAct = t.id === prefs.theme;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `style-pill-btn${isAct ? ' is-active' : ''}`;
        btn.dataset.customTheme = String(t.id);
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', isAct ? 'true' : 'false');

        const orb = document.createElement('span');
        orb.className = 'chapter-tab-orb';
        orb.style.background = t.swatchGradient;

        const lbl = document.createElement('span');
        lbl.textContent = t.shortName;

        btn.append(orb, lbl);
        btn.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.gallery.updateCustomPrefs({ theme: t.id });
          this.refreshStartMenuCopy();
          this.renderCustomBuilderUi();
        });
        this.customStylePickerEl!.append(btn);
      });
    }

    const renderSegRow = (
      container: HTMLElement | null,
      min: number,
      max: number,
      current: number,
      dataKey: 'customCols' | 'customRows' | 'customColors',
      onPick: (val: number) => void,
    ) => {
      if (!container) return;
      container.innerHTML = '';
      for (let v = min; v <= max; v++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `seg-btn${current === v ? ' is-active' : ''}`;
        btn.dataset[dataKey] = String(v);
        btn.textContent = String(v);
        btn.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          onPick(v);
          this.refreshStartMenuCopy();
          this.renderCustomBuilderUi();
        });
        container.append(btn);
      }
    };

    renderSegRow(this.customColsPickerEl, 5, 8, prefs.cols, 'customCols', (cols) => this.gallery.updateCustomPrefs({ cols }));
    renderSegRow(this.customRowsPickerEl, 5, 8, prefs.rows, 'customRows', (rows) => this.gallery.updateCustomPrefs({ rows }));
    renderSegRow(this.customColorsPickerEl, 3, 6, prefs.colorCount, 'customColors', (colorCount) =>
      this.gallery.updateCustomPrefs({ colorCount }),
    );

    if (this.customColorPreviewEl) {
      this.customColorPreviewEl.innerHTML = '';
      for (let i = 0; i < prefs.colorCount; i++) {
        const d = document.createElement('span');
        d.className = 'gallery-dot';
        d.style.backgroundColor = (pal[i] ?? pal[0]).hex;
        this.customColorPreviewEl.append(d);
      }
    }

    if (this.customSpecialsPickerEl) {
      this.customSpecialsPickerEl.innerHTML = '';
      const defs: Array<{ key: keyof Pick<CustomModePrefs, 'hearts' | 'rainbows' | 'hidden' | 'locked'>; icon: string; name: string; sub: string }> = [
        { key: 'hearts', icon: '♥', name: 'Hearts', sub: 'Early bonus pts' },
        { key: 'rainbows', icon: '🌈', name: 'Rainbows', sub: 'Wild color match' },
        { key: 'hidden', icon: '?', name: 'Hidden', sub: 'Reveals when free' },
        { key: 'locked', icon: '🔒', name: 'Locked', sub: 'Clear 4 adjacent' },
      ];
      for (const d of defs) {
        const on = prefs[d.key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `special-toggle-card${on ? ' is-on' : ''}`;
        btn.dataset.customSpecial = d.key;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.innerHTML =
          `<span class="special-toggle-icon" aria-hidden="true">${d.icon}</span>` +
          `<div><strong>${d.name}</strong><span>${on ? d.sub : 'Off'}</span></div>`;
        btn.addEventListener('click', () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.gallery.updateCustomPrefs({ [d.key]: !on });
          this.renderCustomBuilderUi();
        });
        this.customSpecialsPickerEl.append(btn);
      }
    }

    const customHistory = this.gallery.getCustomHistory();
    if (this.customArchiveHeading) {
      this.customArchiveHeading.textContent = `COMPLETED CUSTOM PATTERNS (${customHistory.length})`;
    }
    if (!this.customHistoryGridEl) return;
    this.customHistoryGridEl.innerHTML = '';

    if (customHistory.length === 0) {
      this.customHistoryGridEl.append(
        createEmptyArchiveCard(
          '✦',
          'Your Custom Collection',
          'Design your own board above—every custom embroidery you complete will be saved here to admire or replay.',
        ),
      );
      return;
    }

    for (const rec of customHistory) {
      const recTheme = VISUAL_THEMES[rec.theme] ?? VISUAL_THEMES[0];
      const specIcons: string[] = [];
      if ((rec.specialMask & SPECIAL_MASK.HEART) !== 0) specIcons.push('♥');
      if ((rec.specialMask & SPECIAL_MASK.RAINBOW) !== 0) specIcons.push('🌈');
      if ((rec.specialMask & SPECIAL_MASK.HIDDEN) !== 0) specIcons.push('?');
      if ((rec.specialMask & SPECIAL_MASK.LOCKED) !== 0) specIcons.push('🔒');

      const card = createSquareArchiveCard({
        badgeLeft: rec.grid,
        badgeRight: `${recTheme.shortName} · ${rec.colorCount}c${specIcons.length > 0 ? ` · ${specIcons.join('')}` : ''}`,
        statusText: '★'.repeat(Math.max(1, rec.bestStars)),
        statusClass: 'gallery-star',
        title: `Custom #${rec.seed}`,
        scoreLabel: `${rec.bestScore.toLocaleString()} pts`,
        stitches: rec.stitches,
        themeId: rec.theme,
        completed: true,
        footerLeftSub: `${rec.pearls} pearls · ${rec.completedAt}`,
        footerRightText: 'REPLAY',
        footerRightClass: 'gallery-play-chip',
        dataset: { customSeed: String(rec.seed) },
        onClick: () => {
          this.soundscape.unlock();
          this.soundscape.playUiTap(this.host.getHapticsEnabled());
          this.host.onLaunchCustom({
            seed: rec.seed,
            theme: rec.theme,
            cols: rec.cols,
            rows: rec.rows,
            colorCount: rec.colorCount,
            specialMask: rec.specialMask,
          });
        },
      });
      this.customHistoryGridEl.append(card);
    }
  }
}
