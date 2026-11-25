import './style.css';
import { ProceduralSoundscape } from './audio/soundscape';
import { projectWorldToScreen, unprojectScreenToPlane } from './camera';
import { EmbroideryGalleryStore, getTodayDateKey } from './gallery';
import { isIosDevice, isStandalonePwa, isTouchDevice, setupInstallPrompt, setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import {
  CHAPTERS,
  CURATED_LEVELS,
  VISUAL_THEMES,
  WasmSimulation,
  getDailyThemeForDateKey,
  getThemePalette,
  parseSeedInput,
  type SimSnapshot,
} from './wasmBridge';

export type ScreenMode = 'menu' | 'playing';

export interface GameTestState extends SimSnapshot {
  ready: boolean;
  screen: ScreenMode;
  timeMode: 'auto' | 'manual';
  hapticsEnabled: boolean;
  audio: {
    initialized: boolean;
    muted: boolean;
    notesScheduled: number;
    state?: string;
  };
  gallery: {
    completedCuratedIds: number[];
    mandalasCompleted: number;
    dailyCompletedToday: boolean;
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
  reset(): void;
  loadLevel(levelIndex: number): void;
  loadMandala(seed: number): void;
  loadCustomSeed(raw: string): number;
  loadDaily(dateKey?: number): void;
  setTimeOfDayOverride(hours: number | null): void;
  setTheme(themeIndex: number): void;
  enterGame(): void;
  openStartMenu(): void;
}

declare global {
  interface Window {
    __GAME_TEST__?: GameTestBridge;
  }
}

const FIXED_DT = 1 / 60;
const SOLAR_SYNC_INTERVAL_MS = 15_000;
const SCENE_BUFFER_BYTES = 1008 * 4;

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

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const canvasHapticLayer = document.getElementById('canvas-haptic-layer');
  const appEl = document.getElementById('app');
  const fxLayer = document.getElementById('fx-callout-layer');

  // Start Menu elements
  const startMenuEl = document.getElementById('overlay-start-menu');
  const menuSolarBtn = document.getElementById('btn-menu-solar');
  const menuSolarIcon = document.getElementById('menu-solar-icon');
  const menuSolarLabel = document.getElementById('menu-solar-label');
  const menuInstallBtn = document.getElementById('btn-menu-install');
  const menuSettingsIconBtn = document.getElementById('btn-menu-settings');
  const menuOpenSettingsBtn = document.getElementById('btn-menu-open-settings');
  const menuGalleryBtn = document.getElementById('btn-menu-gallery');
  const menuChapterLabel = document.getElementById('menu-chapter-label');
  const menuJourneyBadge = document.getElementById('menu-journey-badge');
  const menuJourneyMain = document.getElementById('menu-journey-main');
  const menuDailyBadge = document.getElementById('menu-daily-badge');
  const menuDailyMeta = document.getElementById('menu-daily-meta');
  const menuEndlessMeta = document.getElementById('menu-endless-meta');
  const modeJourneyBtn = document.getElementById('btn-mode-journey');
  const modeDailyBtn = document.getElementById('btn-mode-daily');
  const modeEndlessBtn = document.getElementById('btn-mode-endless');

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

  // Chapter Gallery drawer elements
  const gallerySheet = document.getElementById('overlay-gallery');
  const closeGalleryBtn = document.getElementById('btn-close-gallery');
  const dailyBtn = document.getElementById('btn-daily-stitch');
  const galleryDailyTag = document.getElementById('gallery-daily-tag');
  const dailyStatusEl = document.getElementById('daily-status');
  const endlessBtn = document.getElementById('btn-endless-mandala');
  const mandalaStatusEl = document.getElementById('mandala-status');
  const seedForm = document.getElementById('seed-form') as HTMLFormElement | null;
  const customSeedInput = document.getElementById('input-custom-seed') as HTMLInputElement | null;
  const chapterTabsEl = document.getElementById('chapter-tabs');
  const chapterBannerTitle = document.getElementById('chapter-banner-title');
  const chapterBannerSub = document.getElementById('chapter-banner-sub');
  const chapterBannerProgress = document.getElementById('chapter-banner-progress');
  const galleryGridEl = document.getElementById('gallery-grid');

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
  const completeBonusLine = document.getElementById('complete-bonus-line');
  const nextLevelBtn = document.getElementById('btn-next-level');
  const replayLevelBtn = document.getElementById('btn-replay-level');

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
    const [sim, renderer] = await Promise.all([
      WasmSimulation.load('./game.wasm'),
      WebGPURaytracer.create(canvas, SCENE_BUFFER_BYTES),
    ]);
    const soundscape = new ProceduralSoundscape();
    const gallery = new EmbroideryGalleryStore();
    let settings = gallery.getSettings();

    let isReady = false;
    let screenMode: ScreenMode = 'menu';
    let activeGalleryChapter = 0;
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
    let prevBlockedEvents = 0;
    let prevHintEvents = 0;
    let prevUndoEvents = 0;

    // Load next uncompleted Journey level onto the live 3D canvas behind the Start Menu
    const initialJourneyIdx = gallery.getNextJourneyLevel();
    sim.loadLevel(initialJourneyIdx);
    activeGalleryChapter = (CURATED_LEVELS[initialJourneyIdx] ?? CURATED_LEVELS[0]).chapter;

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

    const spawnCallout = (
      text: string,
      variant: 'score' | 'streak' | 'milestone' | 'blocked' | 'penalty' | 'rescue',
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
      window.setTimeout(() => el.remove(), variant === 'rescue' || variant === 'milestone' ? 1650 : 1020);
    };

    const updateSolarUi = (hours: number): void => {
      const clock = formatHourClock(hours);
      const phase = describeSolarPhase(hours);
      const modeTag = settings.timeMode === 'auto' ? 'Auto' : 'Manual';
      if (menuSolarIcon) menuSolarIcon.textContent = phase.icon;
      if (menuSolarLabel) menuSolarLabel.textContent = `${modeTag} · ${clock}`;
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
      if (menuInstallBtn) {
        menuInstallBtn.classList.toggle('hidden', standalone);
      }
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
      settingsSheet?.classList.add('hidden');
      gallerySheet?.classList.add('hidden');
      installModal?.classList.remove('hidden');
    };

    const closeInstallGuide = (): void => {
      installModal?.classList.add('hidden');
      wakeRenderer();
    };

    const refreshStartMenuCopy = (): void => {
      const nextIdx = gallery.getNextJourneyLevel();
      const nextLvl = CURATED_LEVELS[nextIdx] ?? CURATED_LEVELS[0];
      const ch = CHAPTERS[nextLvl.chapter] ?? CHAPTERS[0];
      const chProg = gallery.getChapterCompletion(ch.id);
      const today = getTodayDateKey();
      const dailyTheme = getDailyThemeForDateKey(today.keyNum);
      const prog = gallery.getSnapshot();
      const dailyDone = prog.completedDailyDates.includes(today.label);

      if (menuChapterLabel) {
        menuChapterLabel.textContent = `CHAPTER ${ch.roman} · ${ch.name.toUpperCase()} · ${chProg.done}/${chProg.total}`;
      }
      if (menuJourneyBadge) {
        menuJourneyBadge.textContent = `CHAPTER ${ch.roman} · ${ch.name.toUpperCase()}`;
      }
      if (menuJourneyMain) {
        menuJourneyMain.textContent = `Play ${nextLvl.name}`;
      }
      if (menuDailyBadge) {
        menuDailyBadge.textContent = `TODAY · ${dailyTheme.shortName.toUpperCase()} EDITION`;
      }
      if (menuDailyMeta) {
        menuDailyMeta.textContent = dailyDone ? `✦ Completed (${today.label})` : today.label;
      }
      if (menuEndlessMeta) {
        menuEndlessMeta.textContent =
          prog.mandalasCompleted > 0 ? `${prog.mandalasCompleted} stitched · Random theme` : 'Random theme · Infinite';
      }
    };

    const setScreen = (next: ScreenMode): void => {
      screenMode = next;
      if (appEl) appEl.dataset.screen = next;
      startMenuEl?.classList.toggle('hidden', next !== 'menu');
      hudTopEl?.classList.toggle('hidden', next !== 'playing');
      hudBottomEl?.classList.toggle('hidden', next !== 'playing');
      if (next === 'menu') {
        trayFullModal?.classList.add('hidden');
        completeModal?.classList.add('hidden');
        refreshStartMenuCopy();
      }
      wakeRenderer();
    };

    const closeGallery = (): void => {
      gallerySheet?.classList.add('hidden');
      wakeRenderer();
    };

    const closeSettings = (): void => {
      settingsSheet?.classList.add('hidden');
      wakeRenderer();
    };

    const openSettings = (): void => {
      soundscape.unlock();
      updateSolarUi(getEffectiveHours());
      updateAudioUi();
      gallerySheet?.classList.add('hidden');
      settingsSheet?.classList.remove('hidden');
    };

    const renderGalleryUi = (): void => {
      const prog = gallery.getSnapshot();
      const today = getTodayDateKey();
      const dailyDone = prog.completedDailyDates.includes(today.label);
      const dailyTheme = getDailyThemeForDateKey(today.keyNum);

      if (galleryDailyTag) {
        galleryDailyTag.textContent = `TODAY · ${dailyTheme.shortName.toUpperCase()}`;
      }
      if (dailyStatusEl) {
        dailyStatusEl.textContent = dailyDone ? `★★★ Stitched (${today.label})` : today.label;
      }
      if (mandalaStatusEl) {
        mandalaStatusEl.textContent = `${prog.mandalasCompleted} stitched`;
      }

      // Render 5 Chapter Tabs
      if (chapterTabsEl) {
        chapterTabsEl.innerHTML = '';
        CHAPTERS.forEach((ch) => {
          const theme = VISUAL_THEMES[ch.themeId] ?? VISUAL_THEMES[0];
          const chProg = gallery.getChapterCompletion(ch.id);
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
          lbl.textContent = `${ch.roman}·${ch.shortName}`;

          const cnt = document.createElement('span');
          cnt.className = 'gallery-meta';
          cnt.textContent = `${chProg.done}/${chProg.total}`;

          tab.append(orb, lbl, cnt);
          tab.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            activeGalleryChapter = ch.id;
            renderGalleryUi();
          });
          chapterTabsEl.append(tab);
        });
      }

      const activeCh = CHAPTERS[activeGalleryChapter] ?? CHAPTERS[0];
      const chProg = gallery.getChapterCompletion(activeCh.id);
      if (chapterBannerTitle) chapterBannerTitle.textContent = `Chapter ${activeCh.roman} · ${activeCh.name}`;
      if (chapterBannerSub) chapterBannerSub.textContent = activeCh.subtitle;
      if (chapterBannerProgress) chapterBannerProgress.textContent = `${chProg.done}/${chProg.total}`;

      if (!galleryGridEl) return;
      galleryGridEl.innerHTML = '';

      const pal = getThemePalette(activeCh.themeId);
      const chapterLevels = CURATED_LEVELS.slice(activeCh.startIndex, activeCh.startIndex + activeCh.count);
      chapterLevels.forEach((lvl) => {
        const done = prog.completedCurated[lvl.id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gallery-item${done ? ' is-completed' : ''}`;
        btn.dataset.levelIndex = String(lvl.id);

        const top = document.createElement('div');
        top.className = 'gallery-item-top';

        const nameEl = document.createElement('span');
        nameEl.className = 'gallery-item-name';
        nameEl.textContent = lvl.name;

        const starEl = document.createElement('span');
        starEl.className = 'gallery-star';
        starEl.textContent = done ? '★'.repeat(Math.max(1, done.bestStars)) : lvl.grid;

        top.append(nameEl, starEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'gallery-meta';
        metaEl.textContent = done
          ? `${done.bestScore.toLocaleString()} pts · ${done.bestMaxStreak}× streak`
          : `${lvl.pearls} pearls · ${lvl.grid}`;

        const dots = document.createElement('div');
        dots.className = 'gallery-dots';
        for (const cIdx of lvl.colors) {
          const d = document.createElement('span');
          d.className = 'gallery-dot';
          d.style.backgroundColor = (pal[cIdx] ?? pal[0]).hex;
          dots.append(d);
        }

        btn.append(top, metaEl, dots);
        btn.addEventListener('click', () => {
          soundscape.unlock();
          soundscape.playUiTap(settings.hapticsEnabled);
          recordedCompleteKey = '';
          displayedScore = 0;
          sim.loadLevel(lvl.id);
          closeGallery();
          setScreen('playing');
          updateHud(sim.readState(getAspect()));
          wakeRenderer();
        });
        galleryGridEl.append(btn);
      });
    };

    const syncEventCountersBaseline = (snap: SimSnapshot): void => {
      prevStitchEvents = snap.events.stitchEvents;
      prevColorClearEvents = snap.events.colorClearEvents;
      prevLayerClearEvents = snap.events.layerClearEvents;
      prevBlockedEvents = snap.events.blockedEvents;
      prevHintEvents = snap.events.hintEvents;
      prevUndoEvents = snap.events.undoEvents;
    };

    const updateHud = (snap: SimSnapshot): void => {
      soundscape.syncEvents(snap.events, {
        streak: snap.streak,
        trayTension: snap.trayTension,
        hapticsEnabled: settings.hapticsEnabled,
      });

      // Automatically sync CSS theme palette with the active Chapter / Daily / Endless world!
      const domTheme = String(snap.themeIndex);
      if (appEl && domTheme !== lastDomTheme) {
        appEl.dataset.theme = domTheme;
        lastDomTheme = domTheme;
        lastSwatchKey = '';
      }

      // Floating callouts for rewards, milestones, blocker impacts, and Hint/Undo penalties & pinch rescue!
      if (snap.events.layerClearEvents > prevLayerClearEvents) {
        spawnCallout(`★ RING ${snap.layersComplete}/${snap.totalLayers} +750!`, 'milestone', 0.5, 0.28);
      } else if (snap.events.colorClearEvents > prevColorClearEvents) {
        spawnCallout(`✦ COLOR CLEAR +500!`, 'milestone', 0.5, 0.34);
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

      if (snap.events.blockedEvents > prevBlockedEvents) {
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

      // Persist completion into Gallery exactly once per solve
      if (snap.phase === 'complete') {
        const key = `${snap.mode}:${snap.levelIndex}:${snap.events.completeEvents}`;
        if (key !== recordedCompleteKey) {
          recordedCompleteKey = key;
          gallery.recordCompletion(snap.mode, snap.levelIndex, snap.score, snap.stars, snap.maxStreak);
          refreshStartMenuCopy();
          renderGalleryUi();
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

      // Smooth Balatro rolling score ticker
      if (displayedScore !== snap.score) {
        const diff = snap.score - displayedScore;
        if (Math.abs(diff) <= 35 || snap.score < displayedScore) {
          displayedScore = snap.score;
        } else {
          displayedScore += Math.ceil(diff * 0.35);
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
        : `${snap.themeIndex}|${snap.activeColors.map((c, i) => `${c}:${snap.activeRemain[i]}`).join('|')}|N:${snap.nextQueuedColor}`;

      if (swatchListEl && swatchKey !== lastSwatchKey) {
        lastSwatchKey = swatchKey;
        swatchListEl.innerHTML = '';
        if (swatchCaptionEl) {
          swatchCaptionEl.textContent = isDone ? '✦ DONE' : 'STITCH';
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

          // Celebrate Chapter clearance when finishing the 8th pattern of a Chapter!
          const isEndOfChapter =
            snap.mode === 'curated' &&
            (snap.levelIndex + 1) % 8 === 0 &&
            snap.levelIndex + 1 < CURATED_LEVELS.length;
          const nextChapter = isEndOfChapter
            ? CHAPTERS[Math.floor((snap.levelIndex + 1) / 8)]
            : null;

          if (completeEyebrowEl) {
            completeEyebrowEl.textContent = nextChapter
              ? `CHAPTER ${CHAPTERS[snap.chapterIndex]?.roman ?? 'I'} COMPLETE!`
              : 'MASTERPIECE COMPLETE';
          }
          if (nextLevelBtn) {
            nextLevelBtn.textContent = nextChapter
              ? `Enter ${nextChapter.name} →`
              : snap.mode === 'curated' && snap.levelIndex + 1 < CURATED_LEVELS.length
                ? 'Next Pattern'
                : 'New Seed';
          }
          if (completeBonusLine) {
            const badges: string[] = [];
            if (snap.mode !== 'curated' && snap.seed > 0) badges.push(`Seed #${snap.seed}`);
            if (snap.trayUses === 0) badges.push('Pure No-Tray +1,500');
            if (snap.undoUsed === 0 && snap.hintsUsed === 0) badges.push('Flawless +750');
            completeBonusLine.textContent =
              badges.length > 0 ? `${badges.join(' · ')} · Saved to Chapters.` : 'Saved to Chapters Gallery.';
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

    // Attach clipped transparent native <label for="ios-haptic-switch"> overlays onto primary buttons on touch/iOS
    // so real trusted finger taps trigger iOS 26.5+ Taptic Engine clicks!
    if (isTouchDevice()) {
      const hapticButtons = [
        modeJourneyBtn,
        modeDailyBtn,
        modeEndlessBtn,
        undoBtn,
        hintBtn,
        resetBtn,
        nextLevelBtn,
        replayLevelBtn,
        trayUndoBtn,
        trayRestartBtn,
        dailyBtn,
        endlessBtn,
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

    refreshStartMenuCopy();
    renderGalleryUi();
    updateAudioUi();
    updateInstallUi();
    updateSolarUi(getEffectiveHours());

    // Direct-tap board handler: runs on BOTH #canvas-haptic-layer (transparent native switch <label> for iOS 26.5+
    // Taptic Engine clicks!) and #gpu-canvas (when haptics are off). Never calls preventDefault() so Safari still
    // delivers the trusted label->switch toggle; CSS touch-action:none blocks scrolling & zoom!
    const handleBoardPointerDown = (e: PointerEvent): void => {
      if (screenMode !== 'playing') return;
      if (gallerySheet && !gallerySheet.classList.contains('hidden')) return;
      if (settingsSheet && !settingsSheet.classList.contains('hidden')) return;
      if (installModal && !installModal.classList.contains('hidden')) return;
      const now = performance.now();
      if (now - lastBoardTapTs < 35) return;
      lastBoardTapTs = now;
      lastUserTapAt = now;
      soundscape.unlock();
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

    // Start Menu & Install Guide button wiring
    menuInstallBtn?.addEventListener('click', () => {
      void openInstallGuide();
    });
    settingsInstallBtn?.addEventListener('click', () => {
      void openInstallGuide();
    });
    closeInstallBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      closeInstallGuide();
    });

    modeJourneyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      const nextIdx = gallery.getNextJourneyLevel();
      sim.loadLevel(nextIdx);
      activeGalleryChapter = (CURATED_LEVELS[nextIdx] ?? CURATED_LEVELS[0]).chapter;
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeDailyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadDaily(getTodayDateKey().keyNum);
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeEndlessBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      lastUserTapAt = performance.now();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadMandala(gallery.nextMandalaSeed());
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    menuGalleryBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderGalleryUi();
      gallerySheet?.classList.remove('hidden');
    });

    menuSolarBtn?.addEventListener('click', openSettings);
    menuSettingsIconBtn?.addEventListener('click', openSettings);
    menuOpenSettingsBtn?.addEventListener('click', openSettings);
    settingsBtn?.addEventListener('click', openSettings);
    closeSettingsBtn?.addEventListener('click', closeSettings);

    homeBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      renderGalleryUi();
      setScreen('menu');
    });

    // Settings Solar 24h controls (Real-world Auto default + full manual override!)
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
      recordedCompleteKey = '';
      displayedScore = 0;
      const snap = sim.readState(getAspect());
      if (snap.mode === 'curated' && snap.levelIndex + 1 < CURATED_LEVELS.length) {
        const nextIdx = snap.levelIndex + 1;
        sim.loadLevel(nextIdx);
        activeGalleryChapter = (CURATED_LEVELS[nextIdx] ?? CURATED_LEVELS[0]).chapter;
      } else {
        sim.loadMandala(gallery.nextMandalaSeed());
      }
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    patternBtn?.addEventListener('click', () => {
      soundscape.unlock();
      const cur = sim.readState(getAspect());
      if (cur.mode === 'curated') activeGalleryChapter = cur.chapterIndex;
      renderGalleryUi();
      gallerySheet?.classList.toggle('hidden');
    });
    closeGalleryBtn?.addEventListener('click', closeGallery);
    dailyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadDaily(getTodayDateKey().keyNum);
      closeGallery();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });
    endlessBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadMandala(gallery.nextMandalaSeed());
      closeGallery();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    });
    seedForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      const raw = customSeedInput?.value ?? '';
      const parsedSeed = parseSeedInput(raw);
      if (customSeedInput) customSeedInput.value = String(parsedSeed);
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadMandala(parsedSeed);
      closeGallery();
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
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

    // Global capture-phase gesture unlock so ANY tap heals suspended/interrupted/frozen iOS Web Audio!
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

    window.addEventListener('resize', () => {
      renderer.resize();
      wakeRenderer();
      renderNonBlocking();
    });

    // Expose deterministic AI playtest & E2E verification bridge (Spec 02)
    window.__GAME_TEST__ = {
      ready: () => readyPromise,
      getState: () => {
        const prog = gallery.getSnapshot();
        const today = getTodayDateKey().label;
        return {
          ready: isReady,
          screen: screenMode,
          timeMode: settings.timeMode,
          hapticsEnabled: settings.hapticsEnabled,
          ...sim.readState(getAspect()),
          audio: soundscape.getDiagnostics(),
          gallery: {
            completedCuratedIds: Object.keys(prog.completedCurated).map((k) => Number(k)),
            mandalasCompleted: prog.mandalasCompleted,
            dailyCompletedToday: prog.completedDailyDates.includes(today),
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
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadLevel(levelIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadMandala: (seed: number) => {
        lastUserTapAt = performance.now();
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadMandala(seed);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadCustomSeed: (raw: string) => {
        lastUserTapAt = performance.now();
        const seed = parseSeedInput(raw);
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadMandala(seed);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return seed;
      },
      loadDaily: (dateKey?: number) => {
        lastUserTapAt = performance.now();
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
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
      },
      openStartMenu: () => {
        closeGallery();
        closeSettings();
        closeInstallGuide();
        setScreen('menu');
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

    // True 0-FPS Event-Driven Battery-Saving Frame Loop:
    // - 60 FPS ONLY during active 3D motion (pearl flight, temporary 3.5s unlock glow, gentle wiggles, shake)
    // - 0 FPS (ZERO WebGPU submissions & ZERO WASM repacks) while player thinks!
    // - Real-world solar clock syncs once every 15 seconds (not 60x/sec) for effortless battery life.
    // - 0 FPS completely paused when tab is hidden or Gallery/Settings/Install drawer covers canvas.
    let lastTs = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      const sheetOpen =
        Boolean(gallerySheet && !gallerySheet.classList.contains('hidden')) ||
        Boolean(settingsSheet && !settingsSheet.classList.contains('hidden')) ||
        Boolean(installModal && !installModal.classList.contains('hidden'));
      if (document.visibilityState === 'hidden' || sheetOpen) {
        lastTs = now;
        renderer.setIdleThrottled(true);
        requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      // Sync real-world solar position at most once every 15 seconds when in Auto mode
      if (now - lastSolarSyncAt >= SOLAR_SYNC_INTERVAL_MS) {
        syncClock();
        if (settings.timeMode === 'auto') {
          needsImmediateRender = true;
        }
      }

      // Smoothly roll DOM score counter without waking the GPU!
      const liveScore = sim.score();
      if (displayedScore !== liveScore) {
        const diff = liveScore - displayedScore;
        displayedScore =
          Math.abs(diff) <= 35 || liveScore < displayedScore
            ? liveScore
            : displayedScore + Math.ceil(diff * 0.35);
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

    // Calm periodic zero-spoiler active-color pearl wiggle (~3.0s cadence + 2.5s quiet-hand cooldown after taps):
    // Picks 1 random alive pearl of ANY active color (ignoring blocked/unblocked) ONLY when the player pauses
    // to scan the board, returning cleanly to 0 FPS between wiggles and staying 100% 0 FPS on Start Menu / drawers!
    window.setInterval(() => {
      if (!isReady || screenMode !== 'playing' || document.visibilityState !== 'visible') return;
      if (performance.now() - lastUserTapAt < 2500) return;
      const sheetOpen =
        Boolean(gallerySheet && !gallerySheet.classList.contains('hidden')) ||
        Boolean(settingsSheet && !settingsSheet.classList.contains('hidden')) ||
        Boolean(installModal && !installModal.classList.contains('hidden'));
      if (sheetOpen || sim.phase() !== 0 || sim.isAnimating()) return;
      if (sim.triggerActiveWiggle() >= 0) {
        wakeRenderer();
      }
    }, 3000);

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
