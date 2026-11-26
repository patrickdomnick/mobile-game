import './style.css';
import { ProceduralSoundscape } from './audio/soundscape';
import { projectWorldToScreen, unprojectScreenToPlane } from './camera';
import { loadGameConfig, type GameConfig } from './config';
import {
  EmbroideryGalleryStore,
  getTodayDateKey,
  type CustomModePrefs,
  type SeenSpecialKind,
} from './gallery';
import { getLevelTierLabel, loadLevelsCatalog, type RemoteLevelDef } from './levels';
import { renderEmbroideryPreviewSvg } from './preview';
import { isIosDevice, isStandalonePwa, isTouchDevice, setupInstallPrompt, setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import {
  SEED_DIFFICULTIES,
  SPECIAL_MASK,
  TUNING_PARAM,
  VISUAL_THEMES,
  WasmSimulation,
  generateRandomSeed,
  getDailyThemeForDateKey,
  getThemePalette,
  parseSeedInput,
  type SeedDifficultyTier,
  type SimSnapshot,
} from './wasmBridge';

export type ScreenMode = 'intro' | 'menu' | 'playing';
export type SheetName = 'none' | 'gallery' | 'daily-library' | 'random' | 'custom' | 'settings' | 'install';

export interface GameTestState extends SimSnapshot {
  ready: boolean;
  screen: ScreenMode;
  activeSheet: SheetName;
  tutorialActive: boolean;
  tutorialStep: number;
  activeTooltipTitle: string | null;
  onboardingCompleted: boolean;
  seenSpecials: SeenSpecialKind[];
  timeMode: 'auto' | 'manual';
  hapticsEnabled: boolean;
  configSource: 'network' | 'cache' | 'defaults';
  config: GameConfig;
  levelsCatalog: {
    source: 'network' | 'cache' | 'builtin';
    version: number;
    count: number;
    chapters: number;
  };
  audio: {
    initialized: boolean;
    muted: boolean;
    notesScheduled: number;
    state?: string;
    finalRushMode: boolean;
  };
  gallery: {
    completedCuratedIds: number[];
    mandalasCompleted: number;
    dailyCompletedToday: boolean;
    dailyHistoryCount: number;
    randomHistoryCount: number;
    seedDifficulty: SeedDifficultyTier;
  };
  renderer: RendererDiagnostics;
}

export interface GameTestBridge {
  ready(): Promise<void>;
  getState(): GameTestState;
  stepTicks(ticks: number, skipRender?: boolean): Promise<void>;
  tapTile(tileIndex: number): boolean;
  undo(): boolean;
  hint(): number;
  triggerActiveWiggle(): number;
  triggerRainbowWiggle(): number;
  setTuning(paramId: number, value: number): void;
  reset(): void;
  loadLevel(levelIndex: number): void;
  loadMandala(seed: number, diffTier?: SeedDifficultyTier, theme?: number): void;
  loadCustomSeed(raw: string, diffTier?: SeedDifficultyTier, theme?: number): number;
  loadCustomGenerated(opts: {
    seed?: number;
    theme: number;
    cols: number;
    rows: number;
    colorCount: number;
    specialMask: number;
  }): void;
  loadDaily(dateKey?: number): void;
  setTimeOfDayOverride(hours: number | null): void;
  setTheme(themeIndex: number): void;
  enterGame(): void;
  openStartMenu(): void;
  startIntro(): void;
  skipIntro(): void;
  openSheet(name: SheetName): void;
}

declare global {
  interface Window {
    __GAME_TEST__?: GameTestBridge;
  }
}

const FIXED_DT = 1 / 60;
const SOLAR_SYNC_INTERVAL_MS = 15_000;
const SCENE_BUFFER_BYTES = 1248 * 4;

interface CoachTooltipContent {
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

function getRealTimeOfDayHours(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function formatHourClock(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.floor((norm - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function describeSolarPhase(hours: number): { icon: string; name: string } {
  const h = ((hours % 24) + 24) % 24;
  if (h >= 5.5 && h < 8.5) return { icon: '🌅', name: 'Dawn' };
  if (h >= 8.5 && h < 11.5) return { icon: '☀', name: 'Morning' };
  if (h >= 11.5 && h < 16.5) return { icon: '☀', name: 'Noon' };
  if (h >= 16.5 && h < 19.75) return { icon: '🌇', name: 'Golden Hour' };
  if (h >= 19.75 && h < 21.5) return { icon: '🌆', name: 'Twilight' };
  return { icon: '☾', name: 'Night' };
}

function customPrefsToMask(p: CustomModePrefs): number {
  let mask = 0;
  if (p.hearts) mask |= SPECIAL_MASK.HEART;
  if (p.rainbows) mask |= SPECIAL_MASK.RAINBOW;
  if (p.hidden) mask |= SPECIAL_MASK.HIDDEN;
  if (p.locked) mask |= SPECIAL_MASK.LOCKED;
  return mask;
}

async function bootstrap(): Promise<void> {
  setupSafariPwaShell();
  if (isStandalonePwa()) {
    document.documentElement.classList.add('is-standalone');
  }

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const canvasHapticLayer = document.getElementById('canvas-haptic-layer');
  const appEl = document.getElementById('app');
  const fxLayer = document.getElementById('fx-callout-layer');

  // First-load Intro & Contextual Coach Tooltip elements
  const introOverlay = document.getElementById('overlay-intro');
  const introSkipBtn = document.getElementById('btn-intro-skip');
  const introCaptionEl = document.getElementById('intro-caption');
  const coachTooltipEl = document.getElementById('tutorial-tooltip');
  const tooltipIconEl = document.getElementById('tooltip-icon');
  const tooltipTitleEl = document.getElementById('tooltip-title');
  const tooltipTextEl = document.getElementById('tooltip-text');
  const tooltipDismissBtn = document.getElementById('btn-tooltip-dismiss');

  // Start Menu elements (Refined 4-Row Layout)
  const startMenuEl = document.getElementById('overlay-start-menu');
  const menuSettingsIconBtn = document.getElementById('btn-menu-settings');
  const menuChapterLabel = document.getElementById('menu-chapter-label');
  const menuJourneyBadge = document.getElementById('menu-journey-badge');
  const menuJourneyMain = document.getElementById('menu-journey-main');
  const menuJourneyMeta = document.getElementById('menu-journey-meta');
  const menuDailyBadge = document.getElementById('menu-daily-badge');
  const menuDailyMeta = document.getElementById('menu-daily-meta');
  const menuDailyLibMeta = document.getElementById('menu-daily-lib-meta');
  const menuRandomMeta = document.getElementById('menu-random-meta');
  const menuCustomMeta = document.getElementById('menu-custom-meta');
  const menuGalleryBtn = document.getElementById('btn-menu-gallery');
  const menuGalleryLabel = document.getElementById('menu-gallery-label');
  const modeJourneyBtn = document.getElementById('btn-mode-journey');
  const modeDailyBtn = document.getElementById('btn-mode-daily');
  const modeDailyLibraryBtn = document.getElementById('btn-mode-daily-library');
  const modeRandomBtn = document.getElementById('btn-mode-random');
  const modeCustomBtn = document.getElementById('btn-mode-custom');

  // Gameplay HUD elements
  const hudTopEl = document.getElementById('hud-top');
  const hudBottomEl = document.getElementById('hud-bottom');
  const homeBtn = document.getElementById('btn-home');
  const patternBtn = document.getElementById('btn-pattern');
  const patternNameEl = document.getElementById('hud-pattern-name');
  const progressEl = document.getElementById('hud-progress');
  const scoreEl = document.getElementById('hud-score');
  const multEl = document.getElementById('hud-mult');
  const layersEl = document.getElementById('hud-layers');
  const swatchCaptionEl = document.getElementById('swatch-caption');
  const swatchListEl = document.getElementById('swatch-list');
  const swatchNextWrap = document.getElementById('swatch-next-wrap');
  const swatchNextDot = document.getElementById('swatch-next-dot');
  const settingsBtn = document.getElementById('btn-settings');
  const audioBtn = document.getElementById('btn-audio') as HTMLButtonElement | null;
  const audioIconEl = document.getElementById('audio-icon');
  const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
  const hintBtn = document.getElementById('btn-hint') as HTMLButtonElement | null;
  const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement | null;

  // Settings drawer elements
  const settingsSheet = document.getElementById('overlay-settings');
  const closeSettingsBtn = document.getElementById('btn-close-settings');
  const solarReadoutEl = document.getElementById('settings-solar-readout');
  const solarAutoBtn = document.getElementById('btn-solar-auto');
  const solarSlider = document.getElementById('input-solar-hour') as HTMLInputElement | null;
  const settingsSoundBtn = document.getElementById('btn-settings-sound');
  const settingsHapticsBtn = document.getElementById('btn-settings-haptics');
  const settingsInstallStatus = document.getElementById('settings-install-status');
  const settingsInstallBtn = document.getElementById('btn-settings-install') as HTMLButtonElement | null;
  const replayTutorialBtn = document.getElementById('btn-replay-tutorial');

  // Level Select / Campaigns drawer elements
  const gallerySheet = document.getElementById('overlay-gallery');
  const galleryEyebrowEl = document.getElementById('gallery-eyebrow');
  const closeGalleryBtn = document.getElementById('btn-close-gallery');
  const chapterTabsEl = document.getElementById('chapter-tabs');
  const chapterBannerTitle = document.getElementById('chapter-banner-title');
  const chapterBannerSub = document.getElementById('chapter-banner-sub');
  const chapterBannerProgress = document.getElementById('chapter-banner-progress');
  const chapterBannerStars = document.getElementById('chapter-banner-stars');
  const chapterProgressBar = document.getElementById('chapter-progress-bar');
  const galleryGridEl = document.getElementById('gallery-grid');

  // Daily Library sheet elements
  const dailyLibrarySheet = document.getElementById('overlay-daily-library');
  const closeDailyLibraryBtn = document.getElementById('btn-close-daily-library');
  const dailyLibEyebrowEl = document.getElementById('daily-lib-eyebrow');
  const dailyLibTodayTitle = document.getElementById('daily-lib-today-title');
  const dailyLibTodaySub = document.getElementById('daily-lib-today-sub');
  const dailyLibPlayTodayBtn = document.getElementById('btn-daily-lib-play-today');
  const dailyLibraryGridEl = document.getElementById('daily-library-grid');

  // Random Studio sheet elements
  const randomSheet = document.getElementById('overlay-random');
  const closeRandomBtn = document.getElementById('btn-close-random');
  const seedForm = document.getElementById('seed-form') as HTMLFormElement | null;
  const customSeedInput = document.getElementById('input-custom-seed') as HTMLInputElement | null;
  const randomStylePickerEl = document.getElementById('random-style-picker');
  const seedDiffPickerEl = document.getElementById('seed-diff-picker');
  const randomStartBadge = document.getElementById('random-start-badge');
  const startRandomBtn = document.getElementById('btn-start-random');
  const randomArchiveHeading = document.getElementById('random-archive-heading');
  const randomHistoryGridEl = document.getElementById('random-history-grid');

  // Custom Mode Builder sheet elements
  const customSheet = document.getElementById('overlay-custom');
  const closeCustomBtn = document.getElementById('btn-close-custom');
  const customStylePickerEl = document.getElementById('custom-style-picker');
  const customSizeReadoutEl = document.getElementById('custom-size-readout');
  const customColsPickerEl = document.getElementById('custom-cols-picker');
  const customRowsPickerEl = document.getElementById('custom-rows-picker');
  const customColorPreviewEl = document.getElementById('custom-color-preview');
  const customColorsPickerEl = document.getElementById('custom-colors-picker');
  const customSpecialsPickerEl = document.getElementById('custom-specials-picker');
  const customStartBadge = document.getElementById('custom-start-badge');
  const startCustomBtn = document.getElementById('btn-start-custom');

  // Modals
  const trayFullModal = document.getElementById('overlay-tray-full');
  const trayUndoBtn = document.getElementById('btn-tray-undo');
  const trayRestartBtn = document.getElementById('btn-tray-restart');

  const completeModal = document.getElementById('overlay-complete');
  const completeEyebrowEl = document.getElementById('complete-eyebrow');
  const completeStarsEl = document.getElementById('complete-stars');
  const completeTitleEl = document.getElementById('complete-title');
  const completeScoreEl = document.getElementById('complete-score');
  const completeStreakEl = document.getElementById('complete-streak');
  const completeCleanEl = document.getElementById('complete-clean');
  const completeTutorialGuide = document.getElementById('complete-tutorial-guide');
  const completeBonusLine = document.getElementById('complete-bonus-line');
  const nextLevelBtn = document.getElementById('btn-next-level');
  const replayLevelBtn = document.getElementById('btn-replay-level');
  const completeMenuBtn = document.getElementById('btn-complete-menu');

  const installModal = document.getElementById('overlay-install');
  const closeInstallBtn = document.getElementById('btn-close-install');

  const fallbackBanner = document.getElementById('fallback-banner');
  const fallbackMessage = document.getElementById('fallback-message');

  if (!canvas) {
    throw new Error('Missing #gpu-canvas element');
  }

  let resolveReady!: () => void;
  let rejectReady!: (err: unknown) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  try {
    const [sim, renderer, levelsCatalog, loadedConfig] = await Promise.all([
      WasmSimulation.load('./game.wasm'),
      WebGPURaytracer.create(canvas, SCENE_BUFFER_BYTES),
      loadLevelsCatalog('./levels.json'),
      loadGameConfig('./config.json'),
    ]);
    const gameConfig = loadedConfig.config;
    const soundscape = new ProceduralSoundscape();
    const gallery = new EmbroideryGalleryStore();
    let settings = gallery.getSettings();

    const applyTuningConfig = (cfg: GameConfig): void => {
      sim.setTuning(TUNING_PARAM.LOAD_DELAY, cfg.jiggle.loadDelaySec);
      sim.setTuning(TUNING_PARAM.UNLOCK_DELAY, cfg.jiggle.unlockDelaySec);
      sim.setTuning(TUNING_PARAM.JIGGLE_INTENSITY, cfg.jiggle.intensity);
      sim.setTuning(TUNING_PARAM.TOP_LIGHT, cfg.lighting.topLightIntensity);
      sim.setTuning(TUNING_PARAM.GLOW_INTENSITY, cfg.lighting.glowIntensity);
      sim.setTuning(TUNING_PARAM.SHAKE_INTENSITY, cfg.feedback.shakeIntensity);
      sim.setTuning(TUNING_PARAM.HEART_BONUS_MAX, cfg.scoring.heartBonusMax);
      sim.setTuning(TUNING_PARAM.HEART_BONUS_MIN, cfg.scoring.heartBonusMin);
      sim.setTuning(TUNING_PARAM.HINT_PENALTY, cfg.scoring.hintPenalty);
      sim.setTuning(TUNING_PARAM.UNDO_PENALTY, cfg.scoring.undoPenalty);
      soundscape.setRumbleIntensity(cfg.feedback.rumbleIntensity);
    };
    applyTuningConfig(gameConfig);

    let isReady = false;
    let screenMode: ScreenMode = 'menu';
    let activeGalleryChapter = gallery.getSelectedCampaign();
    let tutorialActive = false;
    let tutorialStep = -1;
    let dismissedTooltipKeys = new Set<string>();
    let activeTooltip: CoachTooltipContent | null = null;
    let lastSwatchKey = '';
    let lastLightingTheme = '';
    let lastDomTheme = '';
    let lastSolarSyncAt = 0;
    let lastUserTapAt = performance.now();
    let lastBoardTapTs = 0;
    let needsImmediateRender = true;
    let frameInFlight = false;
    let recordedCompleteKey = '';

    let displayedScore = 0;
    let prevStitchEvents = 0;
    let prevColorClearEvents = 0;
    let prevLayerClearEvents = 0;
    let prevHeartClearEvents = 0;
    let prevRainbowClearEvents = 0;
    let prevHiddenRevealEvents = 0;
    let prevLockBreakEvents = 0;
    let prevLockedTapEvents = 0;
    let prevBlockedEvents = 0;
    let prevHintEvents = 0;
    let prevUndoEvents = 0;

    const getCampaignById = (campaignId: number) => {
      return levelsCatalog.chapters.find((c) => c.id === campaignId) ?? levelsCatalog.chapters[0];
    };

    const findCatalogLevel = (levelId: number): RemoteLevelDef => {
      return (
        levelsCatalog.levels.find((l) => l.id === levelId) ??
        levelsCatalog.levels[levelId % Math.max(1, levelsCatalog.levels.length)] ??
        levelsCatalog.levels[0]
      );
    };

    const loadCatalogLevelById = (levelId: number): RemoteLevelDef => {
      const def = findCatalogLevel(levelId);
      if (def && def.stitches && def.stitches.length > 0) {
        sim.loadCustomLevel(def);
      } else {
        sim.loadLevel(def ? def.id : levelId);
      }
      if (def) {
        activeGalleryChapter = def.chapter;
        gallery.setSelectedCampaign(def.chapter);
      }
      return def;
    };

    const getAspect = (): number => {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0.2, rect.width / Math.max(1, rect.height));
    };

    const getEffectiveHours = (): number => {
      return settings.timeMode === 'manual' ? settings.manualHour : getRealTimeOfDayHours();
    };

    const syncClock = (): void => {
      const hours = getEffectiveHours();
      sim.setTimeOfDayHours(hours);
      soundscape.applySolarAtmosphere(hours);
      updateSolarUi(hours);
      lastSolarSyncAt = performance.now();
    };

    const wakeRenderer = (): void => {
      needsImmediateRender = true;
      renderer.setIdleThrottled(false);
    };

    const getActiveSheet = (): SheetName => {
      if (gallerySheet && !gallerySheet.classList.contains('hidden')) return 'gallery';
      if (dailyLibrarySheet && !dailyLibrarySheet.classList.contains('hidden')) return 'daily-library';
      if (randomSheet && !randomSheet.classList.contains('hidden')) return 'random';
      if (customSheet && !customSheet.classList.contains('hidden')) return 'custom';
      if (settingsSheet && !settingsSheet.classList.contains('hidden')) return 'settings';
      if (installModal && !installModal.classList.contains('hidden')) return 'install';
      return 'none';
    };

    const isAnySheetOpen = (): boolean => getActiveSheet() !== 'none';

    const closeAllSheets = (): void => {
      gallerySheet?.classList.add('hidden');
      dailyLibrarySheet?.classList.add('hidden');
      randomSheet?.classList.add('hidden');
      customSheet?.classList.add('hidden');
      settingsSheet?.classList.add('hidden');
      installModal?.classList.add('hidden');
    };

    const hideCoachTooltip = (): void => {
      activeTooltip = null;
      coachTooltipEl?.classList.add('hidden');
    };

    const showCoachTooltip = (content: CoachTooltipContent): void => {
      if (activeTooltip?.key === content.key && coachTooltipEl && !coachTooltipEl.classList.contains('hidden')) {
        return;
      }
      activeTooltip = content;
      if (coachTooltipEl) {
        coachTooltipEl.dataset.anchor = content.anchor;
        coachTooltipEl.classList.remove('hidden');
      }
      if (tooltipIconEl) tooltipIconEl.textContent = content.icon;
      if (tooltipTitleEl) tooltipTitleEl.textContent = content.title;
      if (tooltipTextEl) tooltipTextEl.textContent = content.text;
    };

    const dismissActiveTooltip = (): void => {
      if (!activeTooltip) return;
      dismissedTooltipKeys.add(activeTooltip.key);
      if (activeTooltip.specialKind) {
        gallery.markSpecialSeen(activeTooltip.specialKind);
      }
      hideCoachTooltip();
    };

    const evaluateCoachTooltips = (snap: SimSnapshot): void => {
      if (screenMode !== 'playing' || snap.phase !== 'playing' || snap.introActive || isAnySheetOpen()) {
        hideCoachTooltip();
        return;
      }

      // 1. Guided Level 1 Tutorial Tooltips
      if (tutorialActive && snap.mode === 'curated' && snap.levelIndex === 0) {
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
        tutorialStep = step;
        if (!dismissedTooltipKeys.has(tip.key)) {
          showCoachTooltip(tip);
        } else {
          hideCoachTooltip();
        }
        return;
      }

      // 2. First-Encounter Special Pearl Tooltips (shown once per pearl type!)
      const order: SeenSpecialKind[] = ['heart', 'rainbow', 'hidden', 'locked'];
      for (const kind of order) {
        if (gallery.hasSeenSpecial(kind)) continue;
        const present = snap.tiles.some((t) => t.alive && t.special === kind);
        if (present) {
          const spec = SPECIAL_ENCOUNTER_TIPS[kind];
          const key = `special:${kind}`;
          if (!dismissedTooltipKeys.has(key)) {
            showCoachTooltip({
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

      hideCoachTooltip();
    };

    const spawnCallout = (
      text: string,
      variant: 'score' | 'streak' | 'heart' | 'rainbow' | 'reveal' | 'unlock' | 'milestone' | 'blocked' | 'penalty' | 'rescue',
      screenX: number,
      screenY: number,
    ): void => {
      if (!fxLayer || screenMode !== 'playing') return;
      const el = document.createElement('div');
      el.className = `fx-callout fx-callout-${variant}`;
      el.textContent = text;
      el.style.left = `${Math.max(14, Math.min(86, screenX * 100))}%`;
      el.style.top = `${Math.max(16, Math.min(84, screenY * 100))}%`;
      fxLayer.append(el);
      window.setTimeout(
        () => el.remove(),
        variant === 'rescue' || variant === 'milestone' || variant === 'heart' || variant === 'rainbow' ? 1650 : 1080,
      );
    };

    const updateSolarUi = (hours: number): void => {
      const clock = formatHourClock(hours);
      const phase = describeSolarPhase(hours);
      const modeTag = settings.timeMode === 'auto' ? 'Auto' : 'Manual';
      if (solarReadoutEl) solarReadoutEl.textContent = `${modeTag} · ${clock} (${phase.name})`;
      if (solarAutoBtn) {
        const isAuto = settings.timeMode === 'auto';
        solarAutoBtn.classList.toggle('is-on', isAuto);
        solarAutoBtn.setAttribute('aria-pressed', isAuto ? 'true' : 'false');
        solarAutoBtn.textContent = isAuto ? 'Auto' : 'Manual';
      }
      if (solarSlider && document.activeElement !== solarSlider) {
        solarSlider.value = String(Math.round(hours * 4) / 4);
      }
    };

    const updateAudioUi = (): void => {
      const muted = soundscape.isMuted();
      if (appEl) {
        appEl.dataset.haptics = settings.hapticsEnabled ? 'on' : 'off';
      }
      if (audioBtn) {
        audioBtn.classList.toggle('is-muted', muted);
        audioBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        audioBtn.setAttribute('aria-label', muted ? 'Unmute Sound' : 'Mute Sound');
      }
      if (audioIconEl) audioIconEl.textContent = muted ? '✕' : '♪';
      if (settingsSoundBtn) {
        settingsSoundBtn.classList.toggle('is-on', !muted);
        settingsSoundBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
        settingsSoundBtn.textContent = muted ? 'Off' : 'On';
      }
      if (settingsHapticsBtn) {
        settingsHapticsBtn.classList.toggle('is-on', settings.hapticsEnabled);
        settingsHapticsBtn.setAttribute('aria-pressed', settings.hapticsEnabled ? 'true' : 'false');
        settingsHapticsBtn.textContent = settings.hapticsEnabled ? 'On' : 'Off';
      }
    };

    const installCtrl = setupInstallPrompt(() => updateInstallUi());

    const updateInstallUi = (): void => {
      const standalone = isStandalonePwa();
      if (settingsInstallStatus) {
        settingsInstallStatus.textContent = standalone
          ? 'Running as installed full-screen app ✦'
          : isIosDevice()
            ? 'In Safari: tap ••• → Share → Add to Home Screen'
            : 'Play full-screen like a native mobile app';
      }
      if (settingsInstallBtn) {
        if (standalone) {
          settingsInstallBtn.textContent = 'Installed';
          settingsInstallBtn.disabled = true;
          settingsInstallBtn.classList.add('is-on');
        } else {
          settingsInstallBtn.disabled = false;
          settingsInstallBtn.textContent = installCtrl.canTriggerNativeInstall() ? 'Install' : 'How';
          settingsInstallBtn.classList.add('is-on');
        }
      }
    };

    const openInstallGuide = async (): Promise<void> => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      if (installCtrl.canTriggerNativeInstall()) {
        await installCtrl.triggerNativeInstall();
        return;
      }
      closeAllSheets();
      installModal?.classList.remove('hidden');
    };

    const refreshStartMenuCopy = (): void => {
      const selectedId = gallery.getSelectedCampaign();
      const ch = getCampaignById(selectedId);
      const frontierId = gallery.getCampaignFrontierLevel(ch.levelIds);
      const frontierLvl = findCatalogLevel(frontierId);
      const chProg = gallery.getChapterCompletion(ch.id, ch.levelIds);
      const frontierPos = Math.max(0, ch.levelIds.indexOf(frontierId)) + 1;
      const allCompleted = chProg.done >= chProg.total && chProg.total > 0;
      const tierLabel = getLevelTierLabel(frontierLvl);

      const prog = gallery.getSnapshot();
      const totalDone = Object.keys(prog.completedCurated).length;
      const today = getTodayDateKey();
      const dailyTheme = getDailyThemeForDateKey(today.keyNum);
      const dailyDone = prog.completedDailyDates.includes(today.label);
      const diffDef = SEED_DIFFICULTIES[prog.seedDifficulty] ?? SEED_DIFFICULTIES[1];
      const cp = prog.customPrefs;

      if (menuChapterLabel) {
        menuChapterLabel.textContent = `${levelsCatalog.chapters.length} CAMPAIGNS · ${totalDone}/${levelsCatalog.levels.length} MASTERED`;
      }
      if (menuJourneyBadge) {
        menuJourneyBadge.textContent = allCompleted
          ? `${ch.name.toUpperCase()} · MASTERED ✦`
          : `${ch.name.toUpperCase()} · LEVEL ${frontierPos} OF ${chProg.total}`;
      }
      if (menuJourneyMain) {
        menuJourneyMain.textContent = allCompleted ? `Replay ${frontierLvl.name}` : `Play ${frontierLvl.name}`;
      }
      if (menuJourneyMeta) {
        menuJourneyMeta.textContent = frontierLvl.noBlockers
          ? `${frontierLvl.grid} · ${tierLabel} · No Blockers`
          : `${frontierLvl.grid} · ${tierLabel} · ${frontierLvl.pearls} pearls`;
      }
      if (menuDailyBadge) {
        menuDailyBadge.textContent = `TODAY · ${dailyTheme.shortName.toUpperCase()}`;
      }
      if (menuDailyMeta) {
        menuDailyMeta.textContent = dailyDone ? `✦ Completed (${today.label})` : today.label;
      }
      if (menuDailyLibMeta) {
        const cnt = prog.dailyHistory.length;
        menuDailyLibMeta.textContent = cnt === 1 ? '1 stitch saved' : `${cnt} stitches saved`;
      }
      if (menuRandomMeta) {
        menuRandomMeta.textContent = `${diffDef.name} ${diffDef.grid} · ${prog.randomHistory.length} done`;
      }
      if (menuCustomMeta) {
        menuCustomMeta.textContent = `${cp.cols}×${cp.rows} · ${cp.colorCount} colors`;
      }
      if (menuGalleryLabel) {
        menuGalleryLabel.textContent = `Level Select · ${totalDone}/${levelsCatalog.levels.length} Mastered`;
      }
    };

    const setScreen = (next: ScreenMode): void => {
      screenMode = next;
      if (appEl) appEl.dataset.screen = next;
      introOverlay?.classList.toggle('hidden', next !== 'intro');
      startMenuEl?.classList.toggle('hidden', next !== 'menu');
      hudTopEl?.classList.toggle('hidden', next !== 'playing');
      hudBottomEl?.classList.toggle('hidden', next !== 'playing');
      if (next !== 'playing') {
        hideCoachTooltip();
        soundscape.setFinalRushMode(false);
        if (appEl) appEl.dataset.rush = 'off';
        trayFullModal?.classList.add('hidden');
        completeModal?.classList.add('hidden');
      }
      if (next === 'menu') {
        refreshStartMenuCopy();
      }
      wakeRenderer();
    };

    const startFirstLoadIntro = (): void => {
      closeAllSheets();
      tutorialActive = true;
      tutorialStep = 0;
      dismissedTooltipKeys = new Set<string>();
      recordedCompleteKey = '';
      displayedScore = 0;
      loadCatalogLevelById(0);
      sim.startIntroUnravel();
      if (introCaptionEl) {
        introCaptionEl.textContent = 'Watch the embroidery unravel into your first puzzle…';
      }
      setScreen('intro');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    const finishIntroIntoTutorial = (immediateSkip = false): void => {
      if (immediateSkip) {
        sim.skipIntroUnravel();
      }
      if (screenMode === 'intro') {
        setScreen('playing');
      }
      lastUserTapAt = performance.now();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    const openSettings = (): void => {
      soundscape.unlock();
      updateSolarUi(getEffectiveHours());
      updateAudioUi();
      updateInstallUi();
      closeAllSheets();
      settingsSheet?.classList.remove('hidden');
    };

    // =========================================================================
    // THEME-SYNCED 1-COLUMN SQUARE LEVEL SELECT / CAMPAIGNS
    // =========================================================================
    const renderGalleryUi = (): void => {
      const prog = gallery.getSnapshot();
      const activeCh = getCampaignById(activeGalleryChapter);

      // Sync visual style of Level Select sheet + live 3D background to selected campaign!
      if (gallerySheet) {
        gallerySheet.dataset.viewTheme = String(activeCh.themeId);
      }
      if (galleryEyebrowEl) {
        galleryEyebrowEl.textContent = `${levelsCatalog.chapters.length} CAMPAIGNS · ${levelsCatalog.levels.length} LEVELS`;
      }

      if (chapterTabsEl) {
        chapterTabsEl.innerHTML = '';
        levelsCatalog.chapters.forEach((ch) => {
          const theme = VISUAL_THEMES[ch.themeId] ?? VISUAL_THEMES[0];
          const chProg = gallery.getChapterCompletion(ch.id, ch.levelIds);
          const tab = document.createElement('button');
          tab.type = 'button';
          tab.className = `chapter-tab${activeGalleryChapter === ch.id ? ' is-active' : ''}`;
          tab.dataset.chapterId = String(ch.id);
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', activeGalleryChapter === ch.id ? 'true' : 'false');

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
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            activeGalleryChapter = ch.id;
            gallery.setSelectedCampaign(ch.id);
            sim.setTheme(ch.themeId);
            if (appEl) {
              appEl.dataset.theme = String(ch.themeId);
              lastDomTheme = String(ch.themeId);
            }
            refreshStartMenuCopy();
            renderGalleryUi();
            wakeRenderer();
          });
          chapterTabsEl.append(tab);
        });
      }

      const chProg = gallery.getChapterCompletion(activeCh.id, activeCh.levelIds);
      const chStars = gallery.getCampaignStars(activeCh.levelIds);
      const frontierId = gallery.getCampaignFrontierLevel(activeCh.levelIds);

      if (chapterBannerTitle) chapterBannerTitle.textContent = activeCh.name;
      if (chapterBannerSub) chapterBannerSub.textContent = activeCh.subtitle;
      if (chapterBannerProgress) chapterBannerProgress.textContent = `${chProg.done}/${chProg.total}`;
      if (chapterBannerStars) chapterBannerStars.textContent = `★ ${chStars.earned}/${chStars.total}`;
      if (chapterProgressBar) {
        const pct = chProg.total > 0 ? Math.round((chProg.done / chProg.total) * 100) : 0;
        chapterProgressBar.style.width = `${pct}%`;
      }

      if (!galleryGridEl) return;
      galleryGridEl.innerHTML = '';

      const pal = getThemePalette(activeCh.themeId);
      const chapterLevels = levelsCatalog.levels.filter((l) => l.chapter === activeCh.id);
      chapterLevels.forEach((lvl, idxInCamp) => {
        const done = prog.completedCurated[lvl.id];
        const unlocked = gallery.isLevelUnlocked(lvl.id, activeCh.levelIds);
        const isCurrent = unlocked && !done && lvl.id === frontierId;
        const tierLabel = getLevelTierLabel(lvl);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `square-level-card${done ? ' is-completed' : ''}${isCurrent ? ' is-current' : ''}${!unlocked ? ' is-locked' : ''}`;
        btn.dataset.levelIndex = String(lvl.id);
        btn.dataset.locked = unlocked ? 'false' : 'true';
        btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');

        // Top bar
        const head = document.createElement('div');
        head.className = 'square-card-head';

        const badges = document.createElement('span');
        badges.className = 'gallery-lvl-badges';

        const numEl = document.createElement('span');
        numEl.className = 'gallery-lvl-num';
        numEl.textContent = `LVL ${String(idxInCamp + 1).padStart(2, '0')}`;

        const gridEl = document.createElement('span');
        gridEl.className = 'gallery-lvl-grid';
        gridEl.textContent = `${lvl.grid} · ${tierLabel}`;

        badges.append(numEl, gridEl);

        const statusEl = document.createElement('span');
        if (done) {
          statusEl.className = 'gallery-star';
          statusEl.textContent = '★'.repeat(Math.max(1, done.bestStars));
        } else if (isCurrent) {
          statusEl.className = 'gallery-play-chip';
          statusEl.textContent = 'PLAY';
        } else {
          statusEl.className = 'gallery-lock-chip';
          statusEl.textContent = '🔒';
        }
        head.append(badges, statusEl);

        // Center finished embroidery SVG preview
        const previewWrap = document.createElement('div');
        previewWrap.className = 'square-card-preview';
        previewWrap.innerHTML = renderEmbroideryPreviewSvg(lvl.stitches, activeCh.themeId, {
          locked: !unlocked,
          size: 196,
        });
        if (!unlocked) {
          const lockTag = document.createElement('span');
          lockTag.className = 'square-lock-overlay';
          lockTag.textContent = `🔒 Clear Level ${idxInCamp}`;
          previewWrap.append(lockTag);
        }

        // Bottom metadata bar
        const foot = document.createElement('div');
        foot.className = 'square-card-foot';

        const titleRow = document.createElement('div');
        titleRow.className = 'square-card-title-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'square-card-name';
        nameEl.textContent = lvl.name;

        const scoreTag = document.createElement('span');
        scoreTag.className = 'square-card-score';
        scoreTag.textContent = done
          ? `${done.bestScore.toLocaleString()} pts`
          : `${lvl.pearls} pearls`;

        titleRow.append(nameEl, scoreTag);

        const metaRow = document.createElement('div');
        metaRow.className = 'square-card-meta-row';

        const dots = document.createElement('div');
        dots.className = 'square-card-dots';
        for (const cIdx of lvl.colors) {
          const d = document.createElement('span');
          d.className = 'gallery-dot';
          d.style.backgroundColor = (pal[cIdx] ?? pal[0]).hex;
          dots.append(d);
        }

        const specIcons: string[] = [];
        if ((lvl.maxHearts ?? 0) > 0) specIcons.push('♥');
        if ((lvl.maxRainbows ?? 0) > 0) specIcons.push('🌈');
        if ((lvl.maxHidden ?? 0) > 0) specIcons.push('?');
        if ((lvl.maxLocked ?? 0) > 0) specIcons.push('🔒');

        const rightMeta = document.createElement('span');
        rightMeta.className = specIcons.length > 0 ? 'square-card-specials' : 'square-card-sub';
        rightMeta.textContent =
          specIcons.length > 0
            ? specIcons.join(' ')
            : lvl.noBlockers
              ? 'No Blockers'
              : 'Classic Pearls';

        metaRow.append(dots, rightMeta);
        foot.append(titleRow, metaRow);

        btn.append(head, previewWrap, foot);
        btn.addEventListener('click', () => {
          soundscape.unlock();
          if (!unlocked) {
            btn.classList.remove('locked-shake');
            void btn.offsetWidth;
            btn.classList.add('locked-shake');
            soundscape.playUiTap(settings.hapticsEnabled);
            return;
          }
          soundscape.playUiTap(settings.hapticsEnabled);
          tutorialActive = false;
          lastUserTapAt = performance.now();
          recordedCompleteKey = '';
          displayedScore = 0;
          loadCatalogLevelById(lvl.id);
          closeAllSheets();
          setScreen('playing');
          updateHud(sim.readState(getAspect()));
          wakeRenderer();
        });
        galleryGridEl.append(btn);
      });
    };

    // =========================================================================
    // DAILY STITCH LIBRARY (Completed Dailies Archive + 1-Tap Replay)
    // =========================================================================
    const renderDailyLibraryUi = (): void => {
      const today = getTodayDateKey();
      const dailyTheme = getDailyThemeForDateKey(today.keyNum);
      const history = gallery.getDailyHistory();
      const doneToday = history.some((d) => d.dateKey === today.keyNum);

      if (dailyLibEyebrowEl) {
        dailyLibEyebrowEl.textContent = `${history.length} DAILY STITCH${history.length === 1 ? '' : 'ES'} SAVED`;
      }
      if (dailyLibTodayTitle) {
        dailyLibTodayTitle.textContent = `Today · ${today.label}`;
      }
      if (dailyLibTodaySub) {
        dailyLibTodaySub.textContent = doneToday
          ? `✦ Completed · ${dailyTheme.name} (6×6)`
          : `${dailyTheme.name} · 6×6 · ♥ 🌈`;
      }
      if (dailyLibPlayTodayBtn) {
        dailyLibPlayTodayBtn.textContent = doneToday ? 'Replay Today' : 'Play Today';
      }

      if (!dailyLibraryGridEl) return;
      dailyLibraryGridEl.innerHTML = '';

      if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-archive-card';
        empty.innerHTML =
          `<span class="empty-archive-icon" aria-hidden="true">✦</span>` +
          `<strong>No Daily Stitches Yet</strong>` +
          `<p>Complete today's Daily Stitch and your finished embroidery will appear here to admire or replay anytime.</p>`;
        dailyLibraryGridEl.append(empty);
        return;
      }

      for (const rec of history) {
        const theme = VISUAL_THEMES[rec.theme] ?? VISUAL_THEMES[0];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'square-level-card is-completed';
        card.dataset.dailyDateKey = String(rec.dateKey);

        const head = document.createElement('div');
        head.className = 'square-card-head';
        head.innerHTML =
          `<span class="gallery-lvl-badges">` +
            `<span class="gallery-lvl-num">${rec.dateLabel}</span>` +
            `<span class="gallery-lvl-grid">${theme.shortName} · ${rec.grid}</span>` +
          `</span>` +
          `<span class="gallery-star">${'★'.repeat(Math.max(1, rec.bestStars))}</span>`;

        const preview = document.createElement('div');
        preview.className = 'square-card-preview';
        preview.innerHTML = renderEmbroideryPreviewSvg(rec.stitches, rec.theme, { size: 196 });

        const foot = document.createElement('div');
        foot.className = 'square-card-foot';
        foot.innerHTML =
          `<div class="square-card-title-row">` +
            `<span class="square-card-name">Daily #${rec.dateKey}</span>` +
            `<span class="square-card-score">${rec.bestScore.toLocaleString()} pts</span>` +
          `</div>` +
          `<div class="square-card-meta-row">` +
            `<span class="square-card-sub">${rec.pearls} pearls · Best ${rec.bestMaxStreak}× streak</span>` +
            `<span class="gallery-play-chip">REPLAY</span>` +
          `</div>`;

        card.append(head, preview, foot);
        card.addEventListener('click', () => {
          soundscape.unlock();
          soundscape.playUiTap(settings.hapticsEnabled);
          tutorialActive = false;
          lastUserTapAt = performance.now();
          recordedCompleteKey = '';
          displayedScore = 0;
          sim.loadDaily(rec.dateKey);
          closeAllSheets();
          setScreen('playing');
          updateHud(sim.readState(getAspect()));
          wakeRenderer();
        });
        dailyLibraryGridEl.append(card);
      }
    };

    // =========================================================================
    // RANDOM MODE STUDIO (Seed + Style + Difficulty + Completed Archive)
    // =========================================================================
    const renderRandomStudioUi = (): void => {
      const stylePref = gallery.getRandomStylePref();
      const diffPref = gallery.getSeedDifficulty();
      const diffDef = SEED_DIFFICULTIES[diffPref] ?? SEED_DIFFICULTIES[1];
      const history = gallery.getRandomHistory();

      if (randomSheet) {
        const viewTheme = stylePref >= 0 ? stylePref : gallery.getSelectedCampaign();
        randomSheet.dataset.viewTheme = String(viewTheme);
      }

      if (randomStartBadge) {
        const styleName = stylePref < 0 ? 'RANDOM STYLE' : (VISUAL_THEMES[stylePref]?.shortName.toUpperCase() ?? 'JEWEL');
        randomStartBadge.textContent = `${styleName} · ${diffDef.name.toUpperCase()} ${diffDef.grid}`;
      }

      if (randomStylePickerEl) {
        randomStylePickerEl.innerHTML = '';
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
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.setRandomStylePref(opt.id);
            renderRandomStudioUi();
          });
          randomStylePickerEl.append(btn);
        }
      }

      if (seedDiffPickerEl) {
        seedDiffPickerEl.innerHTML = '';
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
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.setSeedDifficulty(tier.id);
            refreshStartMenuCopy();
            renderRandomStudioUi();
          });
          seedDiffPickerEl.append(pill);
        });
      }

      if (randomArchiveHeading) {
        randomArchiveHeading.textContent = `COMPLETED RANDOM PATTERNS (${history.length})`;
      }

      if (!randomHistoryGridEl) return;
      randomHistoryGridEl.innerHTML = '';

      if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-archive-card';
        empty.innerHTML =
          `<span class="empty-archive-icon" aria-hidden="true">❖</span>` +
          `<strong>Your Random Archive</strong>` +
          `<p>Pick a style and difficulty above (or type any seed) to play—completed embroideries are saved here.</p>`;
        randomHistoryGridEl.append(empty);
        return;
      }

      for (const rec of history) {
        const theme = VISUAL_THEMES[rec.theme] ?? VISUAL_THEMES[0];
        const tier = SEED_DIFFICULTIES[rec.difficulty] ?? SEED_DIFFICULTIES[1];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'square-level-card is-completed';
        card.dataset.randomSeed = String(rec.seed);

        const head = document.createElement('div');
        head.className = 'square-card-head';
        head.innerHTML =
          `<span class="gallery-lvl-badges">` +
            `<span class="gallery-lvl-num">${tier.name.toUpperCase()}</span>` +
            `<span class="gallery-lvl-grid">${theme.shortName} · ${rec.grid}</span>` +
          `</span>` +
          `<span class="gallery-star">${'★'.repeat(Math.max(1, rec.bestStars))}</span>`;

        const preview = document.createElement('div');
        preview.className = 'square-card-preview';
        preview.innerHTML = renderEmbroideryPreviewSvg(rec.stitches, rec.theme, { size: 196 });

        const foot = document.createElement('div');
        foot.className = 'square-card-foot';
        foot.innerHTML =
          `<div class="square-card-title-row">` +
            `<span class="square-card-name">Seed #${rec.seed}</span>` +
            `<span class="square-card-score">${rec.bestScore.toLocaleString()} pts</span>` +
          `</div>` +
          `<div class="square-card-meta-row">` +
            `<span class="square-card-sub">${rec.pearls} pearls · ${rec.completedAt}</span>` +
            `<span class="gallery-play-chip">REPLAY</span>` +
          `</div>`;

        card.append(head, preview, foot);
        card.addEventListener('click', () => {
          soundscape.unlock();
          soundscape.playUiTap(settings.hapticsEnabled);
          tutorialActive = false;
          lastUserTapAt = performance.now();
          recordedCompleteKey = '';
          displayedScore = 0;
          sim.loadMandala(rec.seed, rec.difficulty, rec.theme);
          closeAllSheets();
          setScreen('playing');
          updateHud(sim.readState(getAspect()));
          wakeRenderer();
        });
        randomHistoryGridEl.append(card);
      }
    };

    // =========================================================================
    // NEW CUSTOM MODE BUILDER (5x5..8x8, 3..6 Colors, Specials, Style)
    // =========================================================================
    const renderCustomBuilderUi = (): void => {
      const prefs = gallery.getCustomPrefs();
      const theme = VISUAL_THEMES[prefs.theme] ?? VISUAL_THEMES[0];
      const pal = getThemePalette(prefs.theme);

      if (customSheet) {
        customSheet.dataset.viewTheme = String(prefs.theme);
      }
      if (customSizeReadoutEl) {
        customSizeReadoutEl.textContent = `${prefs.cols} × ${prefs.rows}`;
      }
      if (customStartBadge) {
        customStartBadge.textContent = `${theme.shortName.toUpperCase()} · ${prefs.cols}×${prefs.rows} · ${prefs.colorCount} COLORS`;
      }

      if (customStylePickerEl) {
        customStylePickerEl.innerHTML = '';
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
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.updateCustomPrefs({ theme: t.id });
            refreshStartMenuCopy();
            renderCustomBuilderUi();
          });
          customStylePickerEl.append(btn);
        });
      }

      if (customColsPickerEl) {
        customColsPickerEl.innerHTML = '';
        for (let c = 5; c <= 8; c++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `seg-btn${prefs.cols === c ? ' is-active' : ''}`;
          btn.dataset.customCols = String(c);
          btn.textContent = String(c);
          btn.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.updateCustomPrefs({ cols: c });
            refreshStartMenuCopy();
            renderCustomBuilderUi();
          });
          customColsPickerEl.append(btn);
        }
      }

      if (customRowsPickerEl) {
        customRowsPickerEl.innerHTML = '';
        for (let r = 5; r <= 8; r++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `seg-btn${prefs.rows === r ? ' is-active' : ''}`;
          btn.dataset.customRows = String(r);
          btn.textContent = String(r);
          btn.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.updateCustomPrefs({ rows: r });
            refreshStartMenuCopy();
            renderCustomBuilderUi();
          });
          customRowsPickerEl.append(btn);
        }
      }

      if (customColorPreviewEl) {
        customColorPreviewEl.innerHTML = '';
        for (let i = 0; i < prefs.colorCount; i++) {
          const d = document.createElement('span');
          d.className = 'gallery-dot';
          d.style.backgroundColor = (pal[i] ?? pal[0]).hex;
          customColorPreviewEl.append(d);
        }
      }

      if (customColorsPickerEl) {
        customColorsPickerEl.innerHTML = '';
        for (let k = 3; k <= 6; k++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `seg-btn${prefs.colorCount === k ? ' is-active' : ''}`;
          btn.dataset.customColors = String(k);
          btn.textContent = String(k);
          btn.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.updateCustomPrefs({ colorCount: k });
            refreshStartMenuCopy();
            renderCustomBuilderUi();
          });
          customColorsPickerEl.append(btn);
        }
      }

      if (customSpecialsPickerEl) {
        customSpecialsPickerEl.innerHTML = '';
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
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            gallery.updateCustomPrefs({ [d.key]: !on });
            renderCustomBuilderUi();
          });
          customSpecialsPickerEl.append(btn);
        }
      }
    };

    const launchCustomFromPrefs = (): void => {
      const prefs = gallery.getCustomPrefs();
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadCustomGenerated({
        seed: generateRandomSeed(),
        theme: prefs.theme,
        cols: prefs.cols,
        rows: prefs.rows,
        colorCount: prefs.colorCount,
        specialMask: customPrefsToMask(prefs),
      });
      closeAllSheets();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    const syncEventCountersBaseline = (snap: SimSnapshot): void => {
      prevStitchEvents = snap.events.stitchEvents;
      prevColorClearEvents = snap.events.colorClearEvents;
      prevLayerClearEvents = snap.events.layerClearEvents;
      prevHeartClearEvents = snap.events.heartClearEvents;
      prevRainbowClearEvents = snap.events.rainbowClearEvents;
      prevHiddenRevealEvents = snap.events.hiddenRevealEvents;
      prevLockBreakEvents = snap.events.lockBreakEvents;
      prevLockedTapEvents = snap.events.lockedTapEvents;
      prevBlockedEvents = snap.events.blockedEvents;
      prevHintEvents = snap.events.hintEvents;
      prevUndoEvents = snap.events.undoEvents;
    };

    const updateHud = (snap: SimSnapshot): void => {
      // Transition cleanly out of 3D Unravel Intro the instant the last pearl lands on the board!
      if (screenMode === 'intro' && !snap.introActive) {
        finishIntroIntoTutorial(false);
        return;
      }

      const isRush = screenMode === 'playing' && snap.finalColorMode;
      soundscape.setFinalRushMode(isRush);
      if (appEl) {
        appEl.dataset.rush = isRush ? 'on' : 'off';
      }

      soundscape.syncEvents(snap.events, {
        streak: snap.streak,
        trayTension: snap.trayTension,
        hapticsEnabled: settings.hapticsEnabled,
      });

      const domTheme = String(snap.themeIndex);
      if (appEl && domTheme !== lastDomTheme) {
        appEl.dataset.theme = domTheme;
        lastDomTheme = domTheme;
        lastSwatchKey = '';
      }

      // Floating callouts for Special Pearls, milestones, streaks, blocker impacts, and Hint/Undo
      if (snap.events.heartClearEvents > prevHeartClearEvents && snap.lastHeartBonus > 0) {
        spawnCallout(`♥ HEART +${snap.lastHeartBonus}!`, 'heart', 0.5, 0.23);
      }
      if (snap.events.rainbowClearEvents > prevRainbowClearEvents) {
        spawnCallout(`🌈 WILD +250!`, 'rainbow', 0.5, 0.27);
      }
      if (snap.events.hiddenRevealEvents > prevHiddenRevealEvents) {
        spawnCallout(`✨ REVEALED!`, 'reveal', 0.5, 0.54);
      }
      if (snap.events.lockBreakEvents > prevLockBreakEvents) {
        spawnCallout(`🔓 UNLOCKED!`, 'unlock', 0.5, 0.58);
      }

      if (snap.events.layerClearEvents > prevLayerClearEvents) {
        spawnCallout(`★ RING ${snap.layersComplete}/${snap.totalLayers} +750!`, 'milestone', 0.5, 0.30);
      } else if (snap.events.colorClearEvents > prevColorClearEvents) {
        spawnCallout(`✦ COLOR CLEAR +500!`, 'milestone', 0.5, 0.36);
      } else if (snap.events.stitchEvents > prevStitchEvents && snap.lastScoreDelta > 0) {
        const proj = projectWorldToScreen(snap.lastEventWorldX, 0.2, snap.lastEventWorldZ, getAspect());
        const multLabel = snap.multiplier > 1 ? ` ×${snap.multiplier}!` : '';
        spawnCallout(
          `+${snap.lastScoreDelta}${multLabel}`,
          snap.multiplier >= 3 ? 'streak' : 'score',
          proj.screenX,
          proj.screenY - 0.04,
        );
      }

      if (snap.events.lockedTapEvents > prevLockedTapEvents) {
        spawnCallout('🔒 Clear 4 adjacent!', 'blocked', 0.5, 0.64);
      } else if (snap.events.blockedEvents > prevBlockedEvents) {
        const proj =
          snap.lastBlockerIdx >= 0 && snap.tiles[snap.lastBlockerIdx]
            ? snap.tiles[snap.lastBlockerIdx]
            : { screenX: 0.5, screenY: 0.65 };
        spawnCallout('Blocked!', 'blocked', proj.screenX, proj.screenY - 0.03);
      }

      if (snap.events.hintEvents > prevHintEvents) {
        if (snap.hintNeedsUndo) {
          spawnCallout('Pinch! Tap Undo ↶ to backtrack', 'rescue', 0.5, 0.78);
        } else if (snap.lastPenaltyDelta > 0) {
          spawnCallout(`-${snap.lastPenaltyDelta} Hint`, 'penalty', 0.5, 0.80);
        }
      }

      if (snap.events.undoEvents > prevUndoEvents) {
        spawnCallout(`-${snap.lastPenaltyDelta || 150} Undo`, 'penalty', 0.26, 0.82);
      }

      syncEventCountersBaseline(snap);

      // Persist completion + miniature embroidery preview snapshot once per solve
      if (snap.phase === 'complete') {
        const key = `${snap.mode}:${snap.levelIndex}:${snap.seed}:${snap.events.completeEvents}`;
        if (key !== recordedCompleteKey) {
          recordedCompleteKey = key;
          const stitches = sim.readHoopPreviewStitches();
          gallery.recordCompletion(snap.mode, snap.levelIndex, snap.score, snap.stars, snap.maxStreak, {
            seed: snap.seed,
            theme: snap.themeIndex,
            difficulty: snap.seedDifficulty,
            grid: `${snap.gridCols}×${snap.gridRows}`,
            pearls: snap.totalPearls,
            stitches,
          });
          if (tutorialActive && snap.mode === 'curated' && snap.levelIndex === 0) {
            gallery.markOnboardingCompleted();
          }
          refreshStartMenuCopy();
          renderGalleryUi();
          renderDailyLibraryUi();
          renderRandomStudioUi();
        }
      }

      const nextLighting = snap.daylightFactor < 0.45 ? 'night' : 'day';
      if (appEl && nextLighting !== lastLightingTheme) {
        appEl.dataset.lighting = nextLighting;
        lastLightingTheme = nextLighting;
      }

      if (patternNameEl) patternNameEl.textContent = snap.levelName;
      if (progressEl) progressEl.textContent = `${snap.stitchedCount}/${snap.totalPearls}`;
      if (layersEl) layersEl.textContent = `${snap.layersComplete}/${snap.totalLayers}`;
      if (undoBtn) {
        undoBtn.disabled = snap.undoDepth === 0;
        undoBtn.classList.toggle('is-rescue', snap.hintNeedsUndo && snap.undoDepth > 0);
      }

      if (displayedScore !== snap.score) {
        const diff = snap.score - displayedScore;
        const snapThresh = isRush ? 75 : 35;
        const stepRatio = isRush ? 0.65 : 0.35;
        if (Math.abs(diff) <= snapThresh || snap.score < displayedScore) {
          displayedScore = snap.score;
        } else {
          displayedScore += Math.ceil(diff * stepRatio);
        }
      }
      if (scoreEl) scoreEl.textContent = displayedScore.toLocaleString();
      if (multEl) {
        multEl.textContent = `×${snap.multiplier}`;
        multEl.classList.toggle('is-hot', snap.multiplier >= 2);
      }

      const pal = getThemePalette(snap.themeIndex);
      const isDone = snap.activeColors.length === 0 && snap.phase === 'complete';
      const swatchKey = isDone
        ? `DONE:${snap.themeIndex}`
        : `${snap.themeIndex}|R:${isRush ? 1 : 0}|${snap.activeColors.map((c, i) => `${c}:${snap.activeRemain[i]}`).join('|')}|N:${snap.nextQueuedColor}`;

      if (swatchListEl && swatchKey !== lastSwatchKey) {
        lastSwatchKey = swatchKey;
        swatchListEl.innerHTML = '';
        if (swatchCaptionEl) {
          swatchCaptionEl.textContent = isDone ? '✦ DONE' : isRush ? 'FINISH' : 'STITCH';
        }
        if (!isDone) {
          for (let i = 0; i < snap.activeColors.length; i++) {
            const colorIdx = snap.activeColors[i];
            const remain = snap.activeRemain[i];
            const info = pal[colorIdx] ?? pal[0];
            const item = document.createElement('span');
            item.className = 'swatch-item';
            item.title = `${info.name} (${remain} left)`;

            const dot = document.createElement('span');
            dot.className = 'swatch-dot swatch-dot-active';
            dot.style.backgroundColor = info.hex;
            dot.style.setProperty('--sw-hi', info.hiHex);
            dot.style.setProperty('--sw-mid', info.hex);
            dot.style.setProperty('--sw-lo', info.loHex);

            const count = document.createElement('span');
            count.className = 'swatch-count';
            count.textContent = String(remain);

            item.append(dot, count);
            swatchListEl.append(item);
          }
        }
        if (swatchNextWrap && swatchNextDot) {
          if (!isDone && snap.nextQueuedColor >= 0 && snap.nextQueuedColor < pal.length) {
            const nextInfo = pal[snap.nextQueuedColor];
            swatchNextWrap.classList.remove('hidden');
            swatchNextDot.style.backgroundColor = nextInfo.hex;
            swatchNextDot.style.setProperty('--sw-hi', nextInfo.hiHex);
            swatchNextDot.style.setProperty('--sw-mid', nextInfo.hex);
            swatchNextDot.style.setProperty('--sw-lo', nextInfo.loHex);
          } else {
            swatchNextWrap.classList.add('hidden');
          }
        }
      }

      evaluateCoachTooltips(snap);

      if (trayFullModal) {
        trayFullModal.classList.toggle('hidden', screenMode !== 'playing' || snap.phase !== 'tray_full');
      }
      if (completeModal) {
        const showComplete = screenMode === 'playing' && snap.phase === 'complete' && snap.flyingCount === 0;
        completeModal.classList.toggle('hidden', !showComplete);
        if (showComplete) {
          displayedScore = snap.score;
          if (scoreEl) scoreEl.textContent = displayedScore.toLocaleString();
          const starsCount = Math.max(1, Math.min(3, snap.stars));
          if (completeStarsEl) {
            completeStarsEl.textContent = '★'.repeat(starsCount) + '☆'.repeat(3 - starsCount);
          }
          if (completeTitleEl) completeTitleEl.textContent = snap.levelName;
          if (completeScoreEl) completeScoreEl.textContent = snap.score.toLocaleString();
          if (completeStreakEl) completeStreakEl.textContent = `${snap.maxStreak}×`;
          const directPct =
            snap.totalPearls > 0 ? Math.min(100, Math.round((snap.directCount / snap.totalPearls) * 100)) : 100;
          if (completeCleanEl) completeCleanEl.textContent = `${directPct}%`;

          const isTutorialComplete = tutorialActive && snap.mode === 'curated' && snap.levelIndex === 0;
          completeTutorialGuide?.classList.toggle('hidden', !isTutorialComplete);
          completeMenuBtn?.classList.remove('hidden');

          const curCh = getCampaignById(snap.chapterIndex);
          const posInCamp = curCh ? curCh.levelIds.indexOf(snap.levelIndex) : -1;
          const nextInCampId =
            snap.mode === 'curated' && curCh && posInCamp >= 0 && posInCamp + 1 < curCh.levelIds.length
              ? curCh.levelIds[posInCamp + 1]
              : -1;
          const nextInCampLvl = nextInCampId >= 0 ? findCatalogLevel(nextInCampId) : null;
          const finishedCampaign = snap.mode === 'curated' && curCh && posInCamp === curCh.levelIds.length - 1;
          const nextCamp =
            finishedCampaign && levelsCatalog.chapters.length > 1
              ? levelsCatalog.chapters[(curCh.id + 1) % levelsCatalog.chapters.length]
              : null;

          if (completeEyebrowEl) {
            completeEyebrowEl.textContent = isTutorialComplete
              ? 'FIRST EMBROIDERY COMPLETE!'
              : finishedCampaign
                ? `${curCh?.name.toUpperCase() ?? 'CAMPAIGN'} MASTERED!`
                : snap.mode === 'curated' && posInCamp >= 0
                  ? `${curCh?.shortName.toUpperCase() ?? 'CAMPAIGN'} · LEVEL ${posInCamp + 1} COMPLETE`
                  : snap.mode === 'custom'
                    ? 'CUSTOM PATTERN COMPLETE'
                    : 'PATTERN COMPLETE';
          }
          if (nextLevelBtn) {
            nextLevelBtn.textContent = isTutorialComplete
              ? 'Continue to Level 2'
              : nextInCampLvl
                ? `Next · ${nextInCampLvl.grid}`
                : nextCamp
                  ? `Explore ${nextCamp.shortName} →`
                  : snap.mode === 'custom'
                    ? 'New Custom'
                    : 'New Pattern';
          }
          if (completeBonusLine) {
            const badges: string[] = [];
            if (snap.mode !== 'curated' && snap.seed > 0) badges.push(`Seed #${snap.seed}`);
            if (nextInCampLvl && !isTutorialComplete) badges.push(`Unlocked #${posInCamp + 2} ${nextInCampLvl.name}`);
            if (snap.trayUses === 0) badges.push('No Tray +1,500');
            if (snap.undoUsed === 0 && snap.hintsUsed === 0) badges.push('No Hints +750');
            completeBonusLine.textContent =
              badges.length > 0 ? badges.join(' · ') : 'Saved to your collection.';
          }
        }
      }
    };

    const renderNow = (): SimSnapshot => {
      const snap = sim.readState(getAspect());
      renderer.render(sim.sceneView(), snap.elapsedSec);
      updateHud(snap);
      return snap;
    };

    const renderNonBlocking = (): void => {
      if (frameInFlight) return;
      frameInFlight = true;
      renderNow();
      renderer.flush().finally(() => {
        frameInFlight = false;
      });
    };

    // Attach transparent native <label for="ios-haptic-switch"> overlays onto primary buttons on touch/iOS
    if (isTouchDevice()) {
      const hapticButtons = [
        modeJourneyBtn,
        modeDailyBtn,
        modeDailyLibraryBtn,
        modeRandomBtn,
        modeCustomBtn,
        menuGalleryBtn,
        startRandomBtn,
        startCustomBtn,
        undoBtn,
        hintBtn,
        resetBtn,
        nextLevelBtn,
        replayLevelBtn,
        trayUndoBtn,
        trayRestartBtn,
      ];
      for (const btn of hapticButtons) {
        if (!btn) continue;
        btn.classList.add('has-haptic-overlay');
        const overlay = document.createElement('label');
        overlay.className = 'btn-haptic-overlay';
        overlay.htmlFor = 'ios-haptic-switch';
        overlay.setAttribute('aria-hidden', 'true');
        btn.append(overlay);
      }
    }

    // Boot into First-Load 3D Unravel Intro for brand-new players, or Start Menu for returning players!
    if (!gallery.isOnboardingCompleted()) {
      startFirstLoadIntro();
    } else {
      const initialCampaign = getCampaignById(activeGalleryChapter);
      const initialFrontierId = gallery.getCampaignFrontierLevel(initialCampaign.levelIds);
      loadCatalogLevelById(initialFrontierId);
      setScreen('menu');
    }

    refreshStartMenuCopy();
    renderGalleryUi();
    renderDailyLibraryUi();
    renderRandomStudioUi();
    renderCustomBuilderUi();
    updateAudioUi();
    updateInstallUi();
    updateSolarUi(getEffectiveHours());

    // Direct-tap board handler
    const handleBoardPointerDown = (e: PointerEvent): void => {
      if (screenMode !== 'playing') return;
      if (isAnySheetOpen()) return;
      const now = performance.now();
      if (now - lastBoardTapTs < 35) return;
      lastBoardTapTs = now;
      lastUserTapAt = now;
      soundscape.unlock();
      // Auto-dismiss a first-encounter Special Pearl tooltip on board interaction so it never blocks play!
      if (activeTooltip?.specialKind) {
        dismissActiveTooltip();
      }
      const rect = canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / Math.max(1, rect.width);
      const v = (e.clientY - rect.top) / Math.max(1, rect.height);
      const hit = unprojectScreenToPlane(u, v, getAspect(), 0.14);
      if (hit) {
        sim.tapWorld(hit.wx, hit.wz);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      }
    };
    canvasHapticLayer?.addEventListener('pointerdown', handleBoardPointerDown);
    canvas.addEventListener('pointerdown', handleBoardPointerDown);

    // Intro & Tooltip wiring
    introSkipBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      finishIntroIntoTutorial(true);
    });
    tooltipDismissBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      dismissActiveTooltip();
    });

    // Settings & Install Guide wiring
    settingsInstallBtn?.addEventListener('click', () => {
      void openInstallGuide();
    });
    closeInstallBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      closeAllSheets();
      wakeRenderer();
    });
    replayTutorialBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      gallery.resetOnboardingForReplay();
      startFirstLoadIntro();
    });

    // Start Menu 4-Row wiring
    modeJourneyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      const selCh = getCampaignById(gallery.getSelectedCampaign());
      const nextId = gallery.getCampaignFrontierLevel(selCh.levelIds);
      loadCatalogLevelById(nextId);
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeDailyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadDaily(getTodayDateKey().keyNum);
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeDailyLibraryBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderDailyLibraryUi();
      closeAllSheets();
      dailyLibrarySheet?.classList.remove('hidden');
    });

    modeRandomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderRandomStudioUi();
      closeAllSheets();
      randomSheet?.classList.remove('hidden');
    });

    modeCustomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderCustomBuilderUi();
      closeAllSheets();
      customSheet?.classList.remove('hidden');
    });

    menuGalleryBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderGalleryUi();
      closeAllSheets();
      gallerySheet?.classList.remove('hidden');
    });

    // Sheet Close buttons
    closeGalleryBtn?.addEventListener('click', () => {
      closeAllSheets();
      wakeRenderer();
    });
    closeDailyLibraryBtn?.addEventListener('click', () => {
      closeAllSheets();
      wakeRenderer();
    });
    closeRandomBtn?.addEventListener('click', () => {
      closeAllSheets();
      wakeRenderer();
    });
    closeCustomBtn?.addEventListener('click', () => {
      closeAllSheets();
      wakeRenderer();
    });
    closeSettingsBtn?.addEventListener('click', () => {
      closeAllSheets();
      wakeRenderer();
    });

    // Daily Library Play Today CTA
    dailyLibPlayTodayBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadDaily(getTodayDateKey().keyNum);
      closeAllSheets();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

    // Random Studio Seed Form & Start Button
    seedForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      const raw = customSeedInput?.value ?? '';
      const parsedSeed = parseSeedInput(raw);
      if (customSeedInput) customSeedInput.value = String(parsedSeed);
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadMandala(parsedSeed, gallery.getSeedDifficulty(), gallery.getRandomStylePref());
      closeAllSheets();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

    startRandomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadMandala(gallery.nextMandalaSeed(), gallery.getSeedDifficulty(), gallery.getRandomStylePref());
      closeAllSheets();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

    // Custom Builder Start Button
    startCustomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      launchCustomFromPrefs();
    });

    menuSettingsIconBtn?.addEventListener('click', openSettings);
    settingsBtn?.addEventListener('click', openSettings);

    homeBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      closeAllSheets();
      renderGalleryUi();
      setScreen('menu');
    });

    completeMenuBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      closeAllSheets();
      setScreen('menu');
    });

    // Settings Lighting 24h controls
    solarAutoBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      const nextMode = settings.timeMode === 'auto' ? 'manual' : 'auto';
      const curHours = getEffectiveHours();
      settings = gallery.updateSettings({ timeMode: nextMode, manualHour: curHours });
      syncClock();
      wakeRenderer();
    });

    solarSlider?.addEventListener('input', () => {
      const h = parseFloat(solarSlider.value);
      if (!Number.isFinite(h)) return;
      settings = gallery.updateSettings({ timeMode: 'manual', manualHour: h });
      syncClock();
      wakeRenderer();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-solar-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundscape.unlock();
        soundscape.playUiTap(settings.hapticsEnabled);
        const h = parseFloat(btn.dataset.solarPreset ?? '12.5');
        settings = gallery.updateSettings({ timeMode: 'manual', manualHour: h });
        syncClock();
        wakeRenderer();
      });
    });

    settingsSoundBtn?.addEventListener('click', () => {
      soundscape.toggleMute();
      updateAudioUi();
    });

    settingsHapticsBtn?.addEventListener('click', () => {
      soundscape.unlock();
      settings = gallery.updateSettings({ hapticsEnabled: !settings.hapticsEnabled });
      soundscape.playUiTap(settings.hapticsEnabled);
      updateAudioUi();
    });

    // Gameplay controls
    const handleUndo = () => {
      soundscape.unlock();
      lastUserTapAt = performance.now();
      sim.undo();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleReset = () => {
      soundscape.unlock();
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.reset();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleHint = () => {
      soundscape.unlock();
      lastUserTapAt = performance.now();
      soundscape.playUiTap(settings.hapticsEnabled);
      sim.hint();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleNextPattern = () => {
      soundscape.unlock();
      lastUserTapAt = performance.now();
      soundscape.playUiTap(settings.hapticsEnabled);
      tutorialActive = false;
      recordedCompleteKey = '';
      displayedScore = 0;
      const snap = sim.readState(getAspect());
      if (snap.mode === 'curated') {
        const curCh = getCampaignById(snap.chapterIndex);
        const pos = curCh.levelIds.indexOf(snap.levelIndex);
        if (pos >= 0 && pos + 1 < curCh.levelIds.length) {
          loadCatalogLevelById(curCh.levelIds[pos + 1]);
        } else {
          const nextCh = levelsCatalog.chapters[(curCh.id + 1) % levelsCatalog.chapters.length] ?? curCh;
          const nextFront = gallery.getCampaignFrontierLevel(nextCh.levelIds);
          loadCatalogLevelById(nextFront);
        }
      } else if (snap.mode === 'custom') {
        launchCustomFromPrefs();
        return;
      } else {
        sim.loadMandala(gallery.nextMandalaSeed(), gallery.getSeedDifficulty(), gallery.getRandomStylePref());
      }
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    patternBtn?.addEventListener('click', () => {
      soundscape.unlock();
      const cur = sim.readState(getAspect());
      if (cur.mode === 'curated') activeGalleryChapter = cur.chapterIndex;
      renderGalleryUi();
      const isOpen = gallerySheet && !gallerySheet.classList.contains('hidden');
      closeAllSheets();
      if (!isOpen) gallerySheet?.classList.remove('hidden');
    });

    audioBtn?.addEventListener('click', () => {
      soundscape.toggleMute();
      updateAudioUi();
    });
    undoBtn?.addEventListener('click', handleUndo);
    trayUndoBtn?.addEventListener('click', handleUndo);
    resetBtn?.addEventListener('click', handleReset);
    trayRestartBtn?.addEventListener('click', handleReset);
    replayLevelBtn?.addEventListener('click', handleReset);
    hintBtn?.addEventListener('click', handleHint);
    nextLevelBtn?.addEventListener('click', handleNextPattern);

    // Global capture-phase gesture unlock for iOS Safari Web Audio
    const handleGlobalAudioUnlock = (): void => {
      soundscape.unlock();
    };
    window.addEventListener('pointerdown', handleGlobalAudioUnlock, { capture: true, passive: true });
    window.addEventListener('touchend', handleGlobalAudioUnlock, { capture: true, passive: true });

    document.addEventListener('visibilitychange', () => {
      soundscape.setVisibilityHidden(document.visibilityState === 'hidden');
    });
    window.addEventListener('pageshow', () => soundscape.handleForegroundResume());
    window.addEventListener('focus', () => soundscape.handleForegroundResume());

    const handleViewportResize = (): void => {
      renderer.resize();
      wakeRenderer();
      renderNonBlocking();
    };
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    // Deterministic AI Playtest & E2E Bridge (Spec 02)
    window.__GAME_TEST__ = {
      ready: () => readyPromise,
      getState: () => {
        const prog = gallery.getSnapshot();
        const today = getTodayDateKey().label;
        return {
          ready: isReady,
          screen: screenMode,
          activeSheet: getActiveSheet(),
          tutorialActive,
          tutorialStep,
          activeTooltipTitle: activeTooltip && coachTooltipEl && !coachTooltipEl.classList.contains('hidden')
            ? activeTooltip.title
            : null,
          onboardingCompleted: prog.onboardingCompleted,
          seenSpecials: [...prog.seenSpecials],
          timeMode: settings.timeMode,
          hapticsEnabled: settings.hapticsEnabled,
          configSource: loadedConfig.source,
          config: gameConfig,
          levelsCatalog: {
            source: levelsCatalog.source,
            version: levelsCatalog.version,
            count: levelsCatalog.levels.length,
            chapters: levelsCatalog.chapters.length,
          },
          ...sim.readState(getAspect()),
          audio: soundscape.getDiagnostics(),
          gallery: {
            completedCuratedIds: Object.keys(prog.completedCurated).map((k) => Number(k)),
            mandalasCompleted: prog.mandalasCompleted,
            dailyCompletedToday: prog.completedDailyDates.includes(today),
            dailyHistoryCount: prog.dailyHistory.length,
            randomHistoryCount: prog.randomHistory.length,
            seedDifficulty: prog.seedDifficulty,
          },
          renderer: renderer.getDiagnostics(),
        };
      },
      stepTicks: async (ticks: number, skipRender = false) => {
        const count = Math.max(1, Math.min(600, Math.floor(ticks)));
        syncClock();
        for (let i = 0; i < count; i++) {
          sim.step(FIXED_DT);
        }
        const snap = sim.readState(getAspect());
        displayedScore = snap.score;
        if (skipRender) {
          updateHud(snap);
          needsImmediateRender = false;
          return;
        }
        if (frameInFlight) {
          await renderer.flush();
        }
        frameInFlight = true;
        try {
          renderer.render(sim.sceneView(), snap.elapsedSec);
          updateHud(snap);
          needsImmediateRender = false;
          await renderer.flush();
        } finally {
          frameInFlight = false;
        }
      },
      tapTile: (tileIndex: number) => {
        lastUserTapAt = performance.now();
        if (activeTooltip?.specialKind) {
          dismissActiveTooltip();
        }
        const ok = sim.tapTile(tileIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      undo: () => {
        lastUserTapAt = performance.now();
        const ok = sim.undo();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      hint: () => {
        lastUserTapAt = performance.now();
        const idx = sim.hint();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return idx;
      },
      triggerActiveWiggle: () => {
        const idx = sim.triggerActiveWiggle();
        if (idx >= 0) wakeRenderer();
        return idx;
      },
      triggerRainbowWiggle: () => {
        const idx = sim.triggerRainbowWiggle();
        if (idx >= 0) wakeRenderer();
        return idx;
      },
      setTuning: (paramId: number, value: number) => {
        sim.setTuning(paramId, value);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      reset: () => {
        lastUserTapAt = performance.now();
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.reset();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadLevel: (levelIndex: number) => {
        lastUserTapAt = performance.now();
        tutorialActive = false;
        recordedCompleteKey = '';
        displayedScore = 0;
        loadCatalogLevelById(levelIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadMandala: (seed: number, diffTier?: SeedDifficultyTier, theme = -1) => {
        lastUserTapAt = performance.now();
        tutorialActive = false;
        recordedCompleteKey = '';
        displayedScore = 0;
        const tier = typeof diffTier === 'number' ? gallery.setSeedDifficulty(diffTier) : gallery.getSeedDifficulty();
        sim.loadMandala(seed, tier, theme);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadCustomSeed: (raw: string, diffTier?: SeedDifficultyTier, theme = -1) => {
        lastUserTapAt = performance.now();
        tutorialActive = false;
        const seed = parseSeedInput(raw);
        recordedCompleteKey = '';
        displayedScore = 0;
        const tier = typeof diffTier === 'number' ? gallery.setSeedDifficulty(diffTier) : gallery.getSeedDifficulty();
        sim.loadMandala(seed, tier, theme);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return seed;
      },
      loadCustomGenerated: (opts) => {
        lastUserTapAt = performance.now();
        tutorialActive = false;
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadCustomGenerated({
          seed: opts.seed ?? generateRandomSeed(),
          theme: opts.theme,
          cols: opts.cols,
          rows: opts.rows,
          colorCount: opts.colorCount,
          specialMask: opts.specialMask,
        });
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadDaily: (dateKey?: number) => {
        lastUserTapAt = performance.now();
        tutorialActive = false;
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadDaily(dateKey ?? getTodayDateKey().keyNum);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      setTimeOfDayOverride: (hours: number | null) => {
        if (hours === null) {
          settings = gallery.updateSettings({ timeMode: 'auto' });
        } else {
          settings = gallery.updateSettings({ timeMode: 'manual', manualHour: hours });
        }
        syncClock();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      setTheme: (themeIndex: number) => {
        sim.setTheme(themeIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      enterGame: () => {
        lastUserTapAt = performance.now();
        if (screenMode === 'intro') {
          sim.skipIntroUnravel();
        }
        closeAllSheets();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
      },
      openStartMenu: () => {
        if (screenMode === 'intro') {
          sim.skipIntroUnravel();
        }
        tutorialActive = false;
        closeAllSheets();
        setScreen('menu');
      },
      startIntro: () => {
        startFirstLoadIntro();
      },
      skipIntro: () => {
        finishIntroIntoTutorial(true);
      },
      openSheet: (name: SheetName) => {
        closeAllSheets();
        if (name === 'gallery') {
          renderGalleryUi();
          gallerySheet?.classList.remove('hidden');
        } else if (name === 'daily-library') {
          renderDailyLibraryUi();
          dailyLibrarySheet?.classList.remove('hidden');
        } else if (name === 'random') {
          renderRandomStudioUi();
          randomSheet?.classList.remove('hidden');
        } else if (name === 'custom') {
          renderCustomBuilderUi();
          customSheet?.classList.remove('hidden');
        } else if (name === 'settings') {
          openSettings();
        } else if (name === 'install') {
          installModal?.classList.remove('hidden');
        }
        wakeRenderer();
      },
    };

    // Initial solar sync + first raytraced frame
    syncClock();
    sim.step(FIXED_DT);
    const firstSnap = renderNow();
    syncEventCountersBaseline(firstSnap);
    needsImmediateRender = false;
    await renderer.flush();
    isReady = true;
    resolveReady();

    // True 0-FPS Event-Driven Battery-Saving Frame Loop
    let lastTs = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      if (document.visibilityState === 'hidden' || isAnySheetOpen()) {
        lastTs = now;
        renderer.setIdleThrottled(true);
        requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      if (now - lastSolarSyncAt >= SOLAR_SYNC_INTERVAL_MS) {
        syncClock();
        if (settings.timeMode === 'auto') {
          needsImmediateRender = true;
        }
      }

      const liveScore = sim.score();
      if (displayedScore !== liveScore) {
        const rushNow = sim.isFinalColorMode();
        const diff = liveScore - displayedScore;
        displayedScore =
          Math.abs(diff) <= (rushNow ? 75 : 35) || liveScore < displayedScore
            ? liveScore
            : displayedScore + Math.ceil(diff * (rushNow ? 0.65 : 0.35));
        if (scoreEl) scoreEl.textContent = displayedScore.toLocaleString();
      }

      const activeMotion = sim.isAnimating() || needsImmediateRender;
      if (activeMotion) {
        renderer.setIdleThrottled(false);
        accumulator += dt;
        while (accumulator >= FIXED_DT) {
          sim.step(FIXED_DT);
          accumulator -= FIXED_DT;
        }
        if (!frameInFlight) {
          renderNonBlocking();
          needsImmediateRender = false;
        }
      } else {
        accumulator = 0;
        renderer.setIdleThrottled(true);
      }

      requestAnimationFrame(frame);
    };

    // Live-configurable periodic zero-spoiler active-color pearl wiggle (suppressed in Final-Color Mode & Intro!)
    window.setInterval(() => {
      if (!isReady || screenMode !== 'playing' || document.visibilityState !== 'visible') return;
      if (sim.isFinalColorMode() || sim.isIntroActive()) return;
      if (performance.now() - lastUserTapAt < gameConfig.jiggle.quietHandMs) return;
      if (isAnySheetOpen() || sim.phase() !== 0 || sim.isAnimating()) return;
      if (sim.triggerActiveWiggle() >= 0) {
        wakeRenderer();
      }
    }, gameConfig.jiggle.intervalMs);

    // Independent periodic Rainbow Wild Pearl wiggle (suppressed in Final-Color Mode & Intro!)
    window.setInterval(() => {
      if (!isReady || screenMode !== 'playing' || document.visibilityState !== 'visible') return;
      if (sim.isFinalColorMode() || sim.isIntroActive()) return;
      if (isAnySheetOpen() || sim.phase() !== 0) return;
      if (sim.triggerRainbowWiggle() >= 0) {
        wakeRenderer();
      }
    }, gameConfig.jiggle.rainbowIntervalMs);

    requestAnimationFrame(frame);
  } catch (err) {
    console.error('[boot] failed:', err);
    if (fallbackBanner) fallbackBanner.classList.remove('hidden');
    if (fallbackMessage) {
      fallbackMessage.textContent =
        err instanceof Error ? err.message : 'Unable to initialize WebGPU raytracer.';
    }
    rejectReady(err);
  }
}

void bootstrap();
