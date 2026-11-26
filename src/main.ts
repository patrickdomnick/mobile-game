import './style.css';
import { ProceduralSoundscape } from './audio/soundscape';
import { projectWorldToScreen, unprojectScreenToPlane } from './camera';
import { loadGameConfig, type GameConfig } from './config';
import { EmbroideryGalleryStore, getTodayDateKey, type SeenSpecialKind } from './gallery';
import { loadLevelsCatalog, type RemoteLevelDef } from './levels';
import { isIosDevice, isStandalonePwa, isTouchDevice, setupInstallPrompt, setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import { CoachTooltipController } from './ui/coach';
import { MenuSheetsController, customPrefsToMask, type SheetName } from './ui/sheets';
import {
  TUNING_PARAM,
  WasmSimulation,
  generateRandomSeed,
  getThemePalette,
  parseSeedInput,
  type SeedDifficultyTier,
  type SimSnapshot,
} from './wasmBridge';

export type ScreenMode = 'intro' | 'menu' | 'playing';
export type { SheetName };

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
    customHistoryCount: number;
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
const MAX_VISIBLE_CALLOUTS = 2;

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

async function bootstrap(): Promise<void> {
  setupSafariPwaShell();
  if (isStandalonePwa()) {
    document.documentElement.classList.add('is-standalone');
  }

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const canvasHapticLayer = document.getElementById('canvas-haptic-layer');
  const appEl = document.getElementById('app');
  const fxLayer = document.getElementById('fx-callout-layer');

  const introOverlay = document.getElementById('overlay-intro');
  const introSkipBtn = document.getElementById('btn-intro-skip');
  const introCaptionEl = document.getElementById('intro-caption');
  const tooltipDismissBtn = document.getElementById('btn-tooltip-dismiss');

  const startMenuEl = document.getElementById('overlay-start-menu');
  const menuSettingsIconBtn = document.getElementById('btn-menu-settings');
  const menuGalleryBtn = document.getElementById('btn-menu-gallery');
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

  // Settings & sheet controls
  const closeSettingsBtn = document.getElementById('btn-close-settings');
  const solarReadoutEl = document.getElementById('settings-solar-readout');
  const solarAutoBtn = document.getElementById('btn-solar-auto');
  const solarSlider = document.getElementById('input-solar-hour') as HTMLInputElement | null;
  const settingsSoundBtn = document.getElementById('btn-settings-sound');
  const settingsHapticsBtn = document.getElementById('btn-settings-haptics');
  const settingsInstallStatus = document.getElementById('settings-install-status');
  const settingsInstallBtn = document.getElementById('btn-settings-install') as HTMLButtonElement | null;
  const replayTutorialBtn = document.getElementById('btn-replay-tutorial');

  const closeGalleryBtn = document.getElementById('btn-close-gallery');
  const closeDailyLibraryBtn = document.getElementById('btn-close-daily-library');
  const dailyLibPlayTodayBtn = document.getElementById('btn-daily-lib-play-today');
  const closeRandomBtn = document.getElementById('btn-close-random');
  const seedForm = document.getElementById('seed-form') as HTMLFormElement | null;
  const customSeedInput = document.getElementById('input-custom-seed') as HTMLInputElement | null;
  const startRandomBtn = document.getElementById('btn-start-random');
  const closeCustomBtn = document.getElementById('btn-close-custom');
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
    let lastPoppedScore = 0;
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

    const coach = new CoachTooltipController(
      {
        root: document.getElementById('tutorial-tooltip'),
        icon: document.getElementById('tooltip-icon'),
        title: document.getElementById('tooltip-title'),
        text: document.getElementById('tooltip-text'),
      },
      gallery,
    );

    const getAspect = (): number => {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0.2, rect.width / Math.max(1, rect.height));
    };

    const wakeRenderer = (): void => {
      needsImmediateRender = true;
      renderer.setIdleThrottled(false);
    };

    const prepareRunStart = (isTutorial = false): void => {
      coach.setTutorialActive(isTutorial);
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      lastPoppedScore = 0;
    };

    const sheets = new MenuSheetsController(gallery, levelsCatalog, soundscape, {
      getHapticsEnabled: () => settings.hapticsEnabled,
      onSelectCampaignTheme: (themeId) => {
        sim.setTheme(themeId);
        if (appEl) {
          appEl.dataset.theme = String(themeId);
          lastDomTheme = String(themeId);
        }
        wakeRenderer();
      },
      onLaunchCurated: (levelId) => {
        prepareRunStart(false);
        loadCatalogLevelById(levelId);
        sheets.closeAll();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      onLaunchDaily: (dateKey) => {
        prepareRunStart(false);
        sim.loadDaily(dateKey);
        sheets.closeAll();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      onLaunchRandom: (seed, diff, theme) => {
        prepareRunStart(false);
        sim.loadMandala(seed, diff, theme);
        sheets.closeAll();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      onLaunchCustom: (opts) => {
        prepareRunStart(false);
        sim.loadCustomGenerated(opts);
        sheets.closeAll();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
    });

    const loadCatalogLevelById = (levelId: number): RemoteLevelDef => {
      const def = sheets.findCatalogLevel(levelId);
      if (def && def.stitches && def.stitches.length > 0) {
        sim.loadCustomLevel(def);
      } else {
        sim.loadLevel(def ? def.id : levelId);
      }
      if (def) {
        sheets.setActiveGalleryChapter(def.chapter);
        gallery.setSelectedCampaign(def.chapter);
      }
      return def;
    };

    const getEffectiveHours = (): number => {
      return settings.timeMode === 'manual' ? settings.manualHour : getRealTimeOfDayHours();
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

    const syncClock = (): void => {
      const hours = getEffectiveHours();
      sim.setTimeOfDayHours(hours);
      soundscape.applySolarAtmosphere(hours);
      updateSolarUi(hours);
      lastSolarSyncAt = performance.now();
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
      sheets.closeAll();
      sheets.installModal?.classList.remove('hidden');
    };

    const setScreen = (next: ScreenMode): void => {
      screenMode = next;
      if (appEl) appEl.dataset.screen = next;
      introOverlay?.classList.toggle('hidden', next !== 'intro');
      startMenuEl?.classList.toggle('hidden', next !== 'menu');
      hudTopEl?.classList.toggle('hidden', next !== 'playing');
      hudBottomEl?.classList.toggle('hidden', next !== 'playing');
      if (next !== 'playing') {
        coach.hide();
        soundscape.setFinalRushMode(false);
        if (appEl) appEl.dataset.rush = 'off';
        trayFullModal?.classList.add('hidden');
        completeModal?.classList.add('hidden');
      }
      if (next === 'menu') {
        sheets.refreshStartMenuCopy();
      }
      wakeRenderer();
    };

    const startFirstLoadIntro = (): void => {
      sheets.closeAll();
      prepareRunStart(true);
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
      sheets.closeAll();
      sheets.settingsSheet?.classList.remove('hidden');
    };

    const launchCustomFromPrefs = (): void => {
      const prefs = gallery.getCustomPrefs();
      prepareRunStart(false);
      sim.loadCustomGenerated({
        seed: generateRandomSeed(),
        theme: prefs.theme,
        cols: prefs.cols,
        rows: prefs.rows,
        colorCount: prefs.colorCount,
        specialMask: customPrefsToMask(prefs),
      });
      sheets.closeAll();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    // Anti-clutter callout gate: max 2 visible floating popups at once so the hoop stays unobstructed!
    const spawnCallout = (
      text: string,
      variant: 'score' | 'streak' | 'heart' | 'rainbow' | 'reveal' | 'unlock' | 'milestone' | 'blocked' | 'penalty' | 'rescue',
      screenX: number,
      screenY: number,
    ): void => {
      if (!fxLayer || screenMode !== 'playing') return;
      while (fxLayer.childElementCount >= MAX_VISIBLE_CALLOUTS) {
        fxLayer.firstElementChild?.remove();
      }
      const el = document.createElement('div');
      el.className = `fx-callout fx-callout-${variant}`;
      el.textContent = text;
      el.style.left = `${Math.max(14, Math.min(86, screenX * 100))}%`;
      el.style.top = `${Math.max(16, Math.min(84, screenY * 100))}%`;
      fxLayer.append(el);
      const ttl =
        variant === 'rescue' || variant === 'milestone' || variant === 'heart' || variant === 'rainbow' ? 1550 : 1020;
      window.setTimeout(() => el.remove(), ttl);
    };

    const triggerScorePop = (): void => {
      if (!scoreEl) return;
      scoreEl.classList.remove('is-pop');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('is-pop');
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

      // Priority-gated floating callouts (suppress minor +100 text when major milestones fire!)
      let majorCalloutFired = false;
      if (snap.events.heartClearEvents > prevHeartClearEvents && snap.lastHeartBonus > 0) {
        spawnCallout(`♥ HEART +${snap.lastHeartBonus}!`, 'heart', 0.5, 0.24);
        majorCalloutFired = true;
      }
      if (snap.events.rainbowClearEvents > prevRainbowClearEvents) {
        spawnCallout(`🌈 WILD +250!`, 'rainbow', 0.5, 0.28);
        majorCalloutFired = true;
      }
      if (snap.events.layerClearEvents > prevLayerClearEvents) {
        spawnCallout(`★ RING ${snap.layersComplete}/${snap.totalLayers} +750!`, 'milestone', 0.5, 0.31);
        majorCalloutFired = true;
      } else if (snap.events.colorClearEvents > prevColorClearEvents) {
        spawnCallout(`✦ COLOR CLEAR +500!`, 'milestone', 0.5, 0.35);
        majorCalloutFired = true;
      }

      if (snap.events.hiddenRevealEvents > prevHiddenRevealEvents) {
        spawnCallout(`✨ REVEALED!`, 'reveal', 0.5, 0.54);
      } else if (snap.events.lockBreakEvents > prevLockBreakEvents) {
        spawnCallout(`🔓 UNLOCKED!`, 'unlock', 0.5, 0.58);
      } else if (!majorCalloutFired && snap.events.stitchEvents > prevStitchEvents && snap.lastScoreDelta > 0) {
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
            cols: snap.gridCols,
            rows: snap.gridRows,
            colorCount: snap.customColorCount,
            specialMask: snap.customSpecialMask,
            grid: `${snap.gridCols}×${snap.gridRows}`,
            pearls: snap.totalPearls,
            stitches,
          });
          if (coach.isTutorialActive() && snap.mode === 'curated' && snap.levelIndex === 0) {
            gallery.markOnboardingCompleted();
          }
          sheets.refreshAll();
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

      if (snap.score > lastPoppedScore && screenMode === 'playing') {
        lastPoppedScore = snap.score;
        triggerScorePop();
      } else if (snap.score < lastPoppedScore) {
        lastPoppedScore = snap.score;
      }

      if (displayedScore !== snap.score) {
        const diff = snap.score - displayedScore;
        const snapThresh = isRush ? 75 : 35;
        const stepRatio = isRush ? 0.65 : 0.35;
        displayedScore =
          Math.abs(diff) <= snapThresh || snap.score < displayedScore
            ? snap.score
            : displayedScore + Math.ceil(diff * stepRatio);
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

      coach.evaluate(snap, screenMode === 'playing', sheets.isAnySheetOpen());

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

          const isTutorialComplete = coach.isTutorialActive() && snap.mode === 'curated' && snap.levelIndex === 0;
          completeTutorialGuide?.classList.toggle('hidden', !isTutorialComplete);
          completeMenuBtn?.classList.remove('hidden');

          const curCh = sheets.getCampaignById(snap.chapterIndex);
          const posInCamp = curCh ? curCh.levelIds.indexOf(snap.levelIndex) : -1;
          const nextInCampId =
            snap.mode === 'curated' && curCh && posInCamp >= 0 && posInCamp + 1 < curCh.levelIds.length
              ? curCh.levelIds[posInCamp + 1]
              : -1;
          const nextInCampLvl = nextInCampId >= 0 ? sheets.findCatalogLevel(nextInCampId) : null;
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
            completeBonusLine.textContent = badges.length > 0 ? badges.join(' · ') : 'Saved to your collection.';
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
      const initialCampaign = sheets.getCampaignById(sheets.getActiveGalleryChapter());
      const initialFrontierId = gallery.getCampaignFrontierLevel(initialCampaign.levelIds);
      loadCatalogLevelById(initialFrontierId);
      setScreen('menu');
    }

    sheets.refreshAll();
    updateAudioUi();
    updateInstallUi();
    updateSolarUi(getEffectiveHours());

    // Direct-tap board handler
    const handleBoardPointerDown = (e: PointerEvent): void => {
      if (screenMode !== 'playing' || sheets.isAnySheetOpen()) return;
      const now = performance.now();
      if (now - lastBoardTapTs < 35) return;
      lastBoardTapTs = now;
      lastUserTapAt = now;
      soundscape.unlock();
      if (coach.hasActiveSpecialTip()) {
        coach.dismiss();
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

    // Intro, Tooltip, Settings & Menu wiring
    introSkipBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      finishIntroIntoTutorial(true);
    });
    tooltipDismissBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      coach.dismiss();
    });
    settingsInstallBtn?.addEventListener('click', () => void openInstallGuide());
    closeInstallBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sheets.closeAll();
      wakeRenderer();
    });
    replayTutorialBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      gallery.resetOnboardingForReplay();
      startFirstLoadIntro();
    });

    modeJourneyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      prepareRunStart(false);
      const selCh = sheets.getCampaignById(gallery.getSelectedCampaign());
      loadCatalogLevelById(gallery.getCampaignFrontierLevel(selCh.levelIds));
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });
    modeDailyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      prepareRunStart(false);
      sim.loadDaily(getTodayDateKey().keyNum);
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });
    modeDailyLibraryBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sheets.renderDailyLibraryUi();
      sheets.closeAll();
      sheets.dailyLibrarySheet?.classList.remove('hidden');
    });
    modeRandomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sheets.renderRandomStudioUi();
      sheets.closeAll();
      sheets.randomSheet?.classList.remove('hidden');
    });
    modeCustomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sheets.renderCustomBuilderUi();
      sheets.closeAll();
      sheets.customSheet?.classList.remove('hidden');
    });
    menuGalleryBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sheets.renderGalleryUi();
      sheets.closeAll();
      sheets.gallerySheet?.classList.remove('hidden');
    });

    for (const btn of [closeGalleryBtn, closeDailyLibraryBtn, closeRandomBtn, closeCustomBtn, closeSettingsBtn]) {
      btn?.addEventListener('click', () => {
        sheets.closeAll();
        wakeRenderer();
      });
    }

    dailyLibPlayTodayBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      prepareRunStart(false);
      sim.loadDaily(getTodayDateKey().keyNum);
      sheets.closeAll();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

    seedForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      const parsedSeed = parseSeedInput(customSeedInput?.value ?? '');
      if (customSeedInput) customSeedInput.value = String(parsedSeed);
      prepareRunStart(false);
      sim.loadMandala(parsedSeed, gallery.getSeedDifficulty(), gallery.getRandomStylePref());
      sheets.closeAll();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

    startRandomBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      prepareRunStart(false);
      sim.loadMandala(gallery.nextMandalaSeed(), gallery.getSeedDifficulty(), gallery.getRandomStylePref());
      sheets.closeAll();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });

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
      coach.setTutorialActive(false);
      sheets.closeAll();
      sheets.renderGalleryUi();
      setScreen('menu');
    });
    completeMenuBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      coach.setTutorialActive(false);
      sheets.closeAll();
      setScreen('menu');
    });

    // Settings Lighting & Audio controls
    solarAutoBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      const nextMode = settings.timeMode === 'auto' ? 'manual' : 'auto';
      settings = gallery.updateSettings({ timeMode: nextMode, manualHour: getEffectiveHours() });
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
      lastPoppedScore = 0;
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
      soundscape.playUiTap(settings.hapticsEnabled);
      prepareRunStart(false);
      const snap = sim.readState(getAspect());
      if (snap.mode === 'curated') {
        const curCh = sheets.getCampaignById(snap.chapterIndex);
        const pos = curCh.levelIds.indexOf(snap.levelIndex);
        if (pos >= 0 && pos + 1 < curCh.levelIds.length) {
          loadCatalogLevelById(curCh.levelIds[pos + 1]);
        } else {
          const nextCh = levelsCatalog.chapters[(curCh.id + 1) % levelsCatalog.chapters.length] ?? curCh;
          loadCatalogLevelById(gallery.getCampaignFrontierLevel(nextCh.levelIds));
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
      if (cur.mode === 'curated') sheets.setActiveGalleryChapter(cur.chapterIndex);
      sheets.renderGalleryUi();
      const isOpen = sheets.gallerySheet && !sheets.gallerySheet.classList.contains('hidden');
      sheets.closeAll();
      if (!isOpen) sheets.gallerySheet?.classList.remove('hidden');
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
          activeSheet: sheets.getActiveSheet(),
          tutorialActive: coach.isTutorialActive(),
          tutorialStep: coach.getTutorialStep(),
          activeTooltipTitle: coach.getActiveTooltipTitle(),
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
            customHistoryCount: prog.customHistory.length,
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
        if (coach.hasActiveSpecialTip()) {
          coach.dismiss();
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
        lastPoppedScore = 0;
        sim.reset();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadLevel: (levelIndex: number) => {
        prepareRunStart(false);
        loadCatalogLevelById(levelIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadMandala: (seed: number, diffTier?: SeedDifficultyTier, theme = -1) => {
        prepareRunStart(false);
        const tier = typeof diffTier === 'number' ? gallery.setSeedDifficulty(diffTier) : gallery.getSeedDifficulty();
        sim.loadMandala(seed, tier, theme);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadCustomSeed: (raw: string, diffTier?: SeedDifficultyTier, theme = -1) => {
        prepareRunStart(false);
        const seed = parseSeedInput(raw);
        const tier = typeof diffTier === 'number' ? gallery.setSeedDifficulty(diffTier) : gallery.getSeedDifficulty();
        sim.loadMandala(seed, tier, theme);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return seed;
      },
      loadCustomGenerated: (opts) => {
        prepareRunStart(false);
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
        prepareRunStart(false);
        sim.loadDaily(dateKey ?? getTodayDateKey().keyNum);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      setTimeOfDayOverride: (hours: number | null) => {
        settings =
          hours === null
            ? gallery.updateSettings({ timeMode: 'auto' })
            : gallery.updateSettings({ timeMode: 'manual', manualHour: hours });
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
        if (screenMode === 'intro') sim.skipIntroUnravel();
        sheets.closeAll();
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
      },
      openStartMenu: () => {
        if (screenMode === 'intro') sim.skipIntroUnravel();
        coach.setTutorialActive(false);
        sheets.closeAll();
        setScreen('menu');
      },
      startIntro: () => startFirstLoadIntro(),
      skipIntro: () => finishIntroIntoTutorial(true),
      openSheet: (name: SheetName) => {
        sheets.closeAll();
        if (name === 'gallery') {
          sheets.renderGalleryUi();
          sheets.gallerySheet?.classList.remove('hidden');
        } else if (name === 'daily-library') {
          sheets.renderDailyLibraryUi();
          sheets.dailyLibrarySheet?.classList.remove('hidden');
        } else if (name === 'random') {
          sheets.renderRandomStudioUi();
          sheets.randomSheet?.classList.remove('hidden');
        } else if (name === 'custom') {
          sheets.renderCustomBuilderUi();
          sheets.customSheet?.classList.remove('hidden');
        } else if (name === 'settings') {
          openSettings();
        } else if (name === 'install') {
          sheets.installModal?.classList.remove('hidden');
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
      if (document.visibilityState === 'hidden' || sheets.isAnySheetOpen()) {
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
      if (sheets.isAnySheetOpen() || sim.phase() !== 0 || sim.isAnimating()) return;
      if (sim.triggerActiveWiggle() >= 0) {
        wakeRenderer();
      }
    }, gameConfig.jiggle.intervalMs);

    // Independent periodic Rainbow Wild Pearl wiggle (suppressed in Final-Color Mode & Intro!)
    window.setInterval(() => {
      if (!isReady || screenMode !== 'playing' || document.visibilityState !== 'visible') return;
      if (sim.isFinalColorMode() || sim.isIntroActive()) return;
      if (sheets.isAnySheetOpen() || sim.phase() !== 0) return;
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
