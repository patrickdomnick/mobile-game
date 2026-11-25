import './style.css';
import { ProceduralSoundscape } from './audio/soundscape';
import { projectWorldToScreen, unprojectScreenToPlane } from './camera';
import { EmbroideryGalleryStore, getTodayDateKey } from './gallery';
import { setupSafariPwaShell } from './pwa';
import { WebGPURaytracer, type RendererDiagnostics } from './renderer/webgpu';
import {
  CURATED_LEVELS,
  CURATED_LEVEL_NAMES,
  VISUAL_THEMES,
  WasmSimulation,
  getThemePalette,
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
  reset(): void;
  loadLevel(levelIndex: number): void;
  loadMandala(seed: number): void;
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
const CALM_FRAME_INTERVAL_MS = 250; // ~4 FPS right after settling
const DEEP_IDLE_INTERVAL_MS = 1000; // 1 FPS deep-idle solar tick (>95% GPU power savings while thinking)
const DEEP_IDLE_AFTER_MS = 3000;
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

function applyPatternClass(dot: HTMLElement, pattern?: string): void {
  dot.classList.remove('pattern-band', 'pattern-ring', 'pattern-diag', 'pattern-cross');
  if (pattern === 'band') dot.classList.add('pattern-band');
  else if (pattern === 'ring') dot.classList.add('pattern-ring');
  else if (pattern === 'diag') dot.classList.add('pattern-diag');
  else if (pattern === 'cross') dot.classList.add('pattern-cross');
}

async function bootstrap(): Promise<void> {
  setupSafariPwaShell();

  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
  const appEl = document.getElementById('app');
  const fxLayer = document.getElementById('fx-callout-layer');

  // Start Menu elements
  const startMenuEl = document.getElementById('overlay-start-menu');
  const menuSolarBtn = document.getElementById('btn-menu-solar');
  const menuSolarIcon = document.getElementById('menu-solar-icon');
  const menuSolarLabel = document.getElementById('menu-solar-label');
  const menuSettingsIconBtn = document.getElementById('btn-menu-settings');
  const menuOpenSettingsBtn = document.getElementById('btn-menu-open-settings');
  const menuGalleryBtn = document.getElementById('btn-menu-gallery');
  const modeJourneyBtn = document.getElementById('btn-mode-journey');
  const modeDailyBtn = document.getElementById('btn-mode-daily');
  const modeEndlessBtn = document.getElementById('btn-mode-endless');
  const menuDailyMeta = document.getElementById('menu-daily-meta');
  const menuEndlessMeta = document.getElementById('menu-endless-meta');
  const menuThemeStrip = document.getElementById('menu-theme-strip');

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
  const settingsThemeGrid = document.getElementById('settings-theme-grid');
  const settingsSoundBtn = document.getElementById('btn-settings-sound');
  const settingsHapticsBtn = document.getElementById('btn-settings-haptics');

  // Gallery drawer elements
  const gallerySheet = document.getElementById('overlay-gallery');
  const closeGalleryBtn = document.getElementById('btn-close-gallery');
  const dailyBtn = document.getElementById('btn-daily-stitch');
  const dailyStatusEl = document.getElementById('daily-status');
  const endlessBtn = document.getElementById('btn-endless-mandala');
  const mandalaStatusEl = document.getElementById('mandala-status');
  const galleryGridEl = document.getElementById('gallery-grid');

  // Modals
  const trayFullModal = document.getElementById('overlay-tray-full');
  const trayUndoBtn = document.getElementById('btn-tray-undo');
  const trayRestartBtn = document.getElementById('btn-tray-restart');

  const completeModal = document.getElementById('overlay-complete');
  const completeStarsEl = document.getElementById('complete-stars');
  const completeTitleEl = document.getElementById('complete-title');
  const completeScoreEl = document.getElementById('complete-score');
  const completeStreakEl = document.getElementById('complete-streak');
  const completeCleanEl = document.getElementById('complete-clean');
  const completeBonusLine = document.getElementById('complete-bonus-line');
  const nextLevelBtn = document.getElementById('btn-next-level');
  const replayLevelBtn = document.getElementById('btn-replay-level');

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
    // Boot TinyGo WASM streaming compilation and WebGPU device creation in parallel!
    const [sim, renderer] = await Promise.all([
      WasmSimulation.load('./game.wasm'),
      WebGPURaytracer.create(canvas, SCENE_BUFFER_BYTES),
    ]);
    const soundscape = new ProceduralSoundscape();
    const gallery = new EmbroideryGalleryStore();
    let settings = gallery.getSettings();

    let isReady = false;
    let screenMode: ScreenMode = 'menu';
    let lastSwatchKey = '';
    let lastLightingTheme = '';
    let lastRenderAt = 0;
    let lastActiveMotionAt = performance.now();
    let needsImmediateRender = true;
    let frameInFlight = false;
    let recordedCompleteKey = '';

    // Rolling Balatro score counter & event trackers for floating callouts
    let displayedScore = 0;
    let prevStitchEvents = 0;
    let prevColorClearEvents = 0;
    let prevLayerClearEvents = 0;
    let prevBlockedEvents = 0;

    // Apply persisted visual theme immediately before first frame
    sim.setTheme(settings.themeIndex);
    if (appEl) appEl.dataset.theme = String(settings.themeIndex);

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
    };

    const wakeRenderer = (): void => {
      needsImmediateRender = true;
      lastActiveMotionAt = performance.now();
      renderer.setIdleThrottled(false);
    };

    const spawnCallout = (
      text: string,
      variant: 'score' | 'streak' | 'milestone' | 'blocked',
      screenX: number,
      screenY: number,
    ): void => {
      if (!fxLayer || screenMode !== 'playing') return;
      const el = document.createElement('div');
      el.className = `fx-callout fx-callout-${variant}`;
      el.textContent = text;
      el.style.left = `${Math.max(14, Math.min(86, screenX * 100))}%`;
      el.style.top = `${Math.max(16, Math.min(82, screenY * 100))}%`;
      fxLayer.append(el);
      window.setTimeout(() => el.remove(), variant === 'milestone' ? 1400 : 960);
    };

    const updateSolarUi = (hours: number): void => {
      const clock = formatHourClock(hours);
      const phase = describeSolarPhase(hours);
      const modeTag = settings.timeMode === 'auto' ? 'Auto' : 'Manual';
      if (menuSolarIcon) menuSolarIcon.textContent = phase.icon;
      if (menuSolarLabel) menuSolarLabel.textContent = `${modeTag} · ${clock}`;
      if (solarReadoutEl) {
        solarReadoutEl.textContent = `${modeTag} · ${clock} (${phase.name})`;
      }
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

    const setScreen = (next: ScreenMode): void => {
      screenMode = next;
      if (appEl) appEl.dataset.screen = next;
      startMenuEl?.classList.toggle('hidden', next !== 'menu');
      hudTopEl?.classList.toggle('hidden', next !== 'playing');
      hudBottomEl?.classList.toggle('hidden', next !== 'playing');
      if (next === 'menu') {
        trayFullModal?.classList.add('hidden');
        completeModal?.classList.add('hidden');
      }
      wakeRenderer();
    };

    const applyTheme = (themeIndex: number): void => {
      const clamped = Math.max(0, Math.min(VISUAL_THEMES.length - 1, Math.floor(themeIndex)));
      settings = gallery.updateSettings({ themeIndex: clamped });
      sim.setTheme(clamped);
      if (appEl) appEl.dataset.theme = String(clamped);
      lastSwatchKey = '';
      renderThemeSelectors();
      renderGalleryUi();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    const renderThemeSelectors = (): void => {
      if (menuThemeStrip) {
        menuThemeStrip.innerHTML = '';
        VISUAL_THEMES.forEach((t) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `theme-chip${settings.themeIndex === t.id ? ' is-active' : ''}`;
          btn.dataset.themeId = String(t.id);
          btn.setAttribute('role', 'radio');
          btn.setAttribute('aria-checked', settings.themeIndex === t.id ? 'true' : 'false');

          const orb = document.createElement('span');
          orb.className = 'theme-swatch-orb';
          orb.style.background = t.swatchGradient;

          const lbl = document.createElement('span');
          lbl.textContent = t.shortName;

          btn.append(orb, lbl);
          btn.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            applyTheme(t.id);
          });
          menuThemeStrip.append(btn);
        });
      }

      if (settingsThemeGrid) {
        settingsThemeGrid.innerHTML = '';
        VISUAL_THEMES.forEach((t) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `settings-theme-card${settings.themeIndex === t.id ? ' is-active' : ''}`;
          btn.dataset.themeId = String(t.id);

          const orb = document.createElement('span');
          orb.className = 'theme-swatch-orb';
          orb.style.background = t.swatchGradient;

          const textWrap = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = t.name;
          const desc = document.createElement('span');
          desc.textContent = t.shortName === 'Noir B&W' ? 'Geometric B&W' : t.tagline.split(' ')[0] + ' style';
          textWrap.append(title, desc);

          btn.append(orb, textWrap);
          btn.addEventListener('click', () => {
            soundscape.unlock();
            soundscape.playUiTap(settings.hapticsEnabled);
            applyTheme(t.id);
          });
          settingsThemeGrid.append(btn);
        });
      }
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
      renderThemeSelectors();
      updateSolarUi(getEffectiveHours());
      updateAudioUi();
      gallerySheet?.classList.add('hidden');
      settingsSheet?.classList.remove('hidden');
    };

    const renderGalleryUi = (): void => {
      const prog = gallery.getSnapshot();
      const today = getTodayDateKey();
      const dailyDone = prog.completedDailyDates.includes(today.label);
      const pal = getThemePalette(settings.themeIndex);

      if (dailyStatusEl) {
        dailyStatusEl.textContent = dailyDone ? `★★★ Stitched (${today.label})` : today.label;
      }
      if (menuDailyMeta) {
        menuDailyMeta.textContent = dailyDone ? `✦ Done today` : today.label;
      }
      if (mandalaStatusEl) {
        mandalaStatusEl.textContent = `${prog.mandalasCompleted} stitched`;
      }
      if (menuEndlessMeta) {
        menuEndlessMeta.textContent =
          prog.mandalasCompleted > 0 ? `${prog.mandalasCompleted} stitched` : 'Infinite 3-ring';
      }
      if (!galleryGridEl) return;
      galleryGridEl.innerHTML = '';

      CURATED_LEVELS.forEach((lvl, idx) => {
        const done = prog.completedCurated[idx];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gallery-item${done ? ' is-completed' : ''}`;
        btn.dataset.levelIndex = String(idx);

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
          sim.loadLevel(idx);
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
    };

    const updateHud = (snap: SimSnapshot): void => {
      soundscape.syncEvents(snap.events, {
        streak: snap.streak,
        trayTension: snap.trayTension,
        hapticsEnabled: settings.hapticsEnabled,
      });

      // Spawn Balatro / Vampire Survivors floating callouts on simulation events!
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
      syncEventCountersBaseline(snap);

      // Persist completion into Gallery exactly once per solve
      if (snap.phase === 'complete') {
        const key = `${snap.mode}:${snap.levelIndex}:${snap.events.completeEvents}`;
        if (key !== recordedCompleteKey) {
          recordedCompleteKey = key;
          gallery.recordCompletion(snap.mode, snap.levelIndex, snap.score, snap.stars, snap.maxStreak);
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
      if (undoBtn) undoBtn.disabled = snap.undoDepth === 0;

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
            dot.className = 'swatch-dot';
            dot.style.backgroundColor = info.hex;
            applyPatternClass(dot, info.pattern);

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
            applyPatternClass(swatchNextDot, nextInfo.pattern);
          } else {
            swatchNextWrap.classList.add('hidden');
          }
        }
      }

      if (trayFullModal) {
        trayFullModal.classList.toggle('hidden', screenMode !== 'playing' || snap.phase !== 'tray_full');
      }
      if (completeModal) {
        const showComplete = screenMode === 'playing' && snap.phase === 'complete' && !snap.isAnimating;
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
          if (completeBonusLine) {
            const badges: string[] = [];
            if (snap.trayUses === 0) badges.push('Pure No-Tray +1,500');
            if (snap.undoUsed === 0) badges.push('Flawless +750');
            completeBonusLine.textContent =
              badges.length > 0 ? `${badges.join(' · ')} · Saved to Gallery.` : 'Saved to Atelier Gallery.';
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

    renderThemeSelectors();
    renderGalleryUi();
    updateAudioUi();
    updateSolarUi(getEffectiveHours());

    // Real touch / pointer interaction mapped analytically onto the untangle board
    canvas.addEventListener('pointerdown', (e) => {
      if (screenMode !== 'playing') return;
      if (gallerySheet && !gallerySheet.classList.contains('hidden')) return;
      if (settingsSheet && !settingsSheet.classList.contains('hidden')) return;
      e.preventDefault();
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
    });

    // Start Menu button wiring
    modeJourneyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      recordedCompleteKey = '';
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeDailyBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.loadDaily(getTodayDateKey().keyNum);
      setScreen('playing');
      updateHud(sim.readState(getAspect()));
    });

    modeEndlessBtn?.addEventListener('click', () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
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
      renderThemeSelectors();
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
      sim.undo();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleReset = () => {
      soundscape.unlock();
      recordedCompleteKey = '';
      displayedScore = 0;
      sim.reset();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleHint = () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      sim.hint();
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };
    const handleNextPattern = () => {
      soundscape.unlock();
      soundscape.playUiTap(settings.hapticsEnabled);
      recordedCompleteKey = '';
      displayedScore = 0;
      const snap = sim.readState(getAspect());
      if (snap.mode === 'curated' && snap.levelIndex + 1 < CURATED_LEVEL_NAMES.length) {
        sim.loadLevel(snap.levelIndex + 1);
      } else {
        sim.loadMandala(gallery.nextMandalaSeed());
      }
      updateHud(sim.readState(getAspect()));
      wakeRenderer();
    };

    patternBtn?.addEventListener('click', () => {
      soundscape.unlock();
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

    document.addEventListener('visibilitychange', () => {
      soundscape.setVisibilityHidden(document.visibilityState === 'hidden');
    });

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
        const ok = sim.tapTile(tileIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      undo: () => {
        const ok = sim.undo();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return ok;
      },
      hint: () => {
        const idx = sim.hint();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
        return idx;
      },
      reset: () => {
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.reset();
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadLevel: (levelIndex: number) => {
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadLevel(levelIndex);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadMandala: (seed: number) => {
        recordedCompleteKey = '';
        displayedScore = 0;
        sim.loadMandala(seed);
        updateHud(sim.readState(getAspect()));
        wakeRenderer();
      },
      loadDaily: (dateKey?: number) => {
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
        applyTheme(themeIndex);
      },
      enterGame: () => {
        setScreen('playing');
        updateHud(sim.readState(getAspect()));
      },
      openStartMenu: () => {
        closeGallery();
        closeSettings();
        setScreen('menu');
      },
    };

    // Initial solar sync + first raytraced frame
    syncClock();
    sim.step(FIXED_DT);
    const firstSnap = renderNow();
    syncEventCountersBaseline(firstSnap);
    await renderer.flush();
    isReady = true;
    resolveReady();

    // Two-tier battery-saving frame loop:
    // - 60 FPS during active 3D motion (pearl flight, bloom, shake, shockwaves)
    // - 4 FPS calm settle -> 1 FPS deep idle while player contemplates (>95% GPU power savings)
    // - 0 FPS completely paused when tab is hidden or Gallery/Settings drawer covers canvas
    let lastTs = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      const sheetOpen =
        Boolean(gallerySheet && !gallerySheet.classList.contains('hidden')) ||
        Boolean(settingsSheet && !settingsSheet.classList.contains('hidden'));
      if (document.visibilityState === 'hidden' || sheetOpen) {
        lastTs = now;
        renderer.setIdleThrottled(true);
        requestAnimationFrame(frame);
        return;
      }

      syncClock();
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const preSnap = sim.readState(getAspect());
      // Smoothly roll DOM score counter without waking the GPU!
      if (displayedScore !== preSnap.score) {
        const diff = preSnap.score - displayedScore;
        displayedScore = Math.abs(diff) <= 35 || preSnap.score < displayedScore ? preSnap.score : displayedScore + Math.ceil(diff * 0.35);
        if (scoreEl) scoreEl.textContent = displayedScore.toLocaleString();
      }
      const activeMotion = preSnap.isAnimating || needsImmediateRender;

      if (activeMotion) {
        lastActiveMotionAt = now;
        renderer.setIdleThrottled(false);
        accumulator += dt;
        while (accumulator >= FIXED_DT) {
          sim.step(FIXED_DT);
          accumulator -= FIXED_DT;
        }
        if (!frameInFlight) {
          renderNonBlocking();
          lastRenderAt = now;
          needsImmediateRender = false;
        }
      } else {
        renderer.setIdleThrottled(true);
        const idleInterval =
          now - lastActiveMotionAt > DEEP_IDLE_AFTER_MS
            ? DEEP_IDLE_INTERVAL_MS
            : CALM_FRAME_INTERVAL_MS;
        if (!frameInFlight && now - lastRenderAt >= idleInterval) {
          sim.step(Math.min(0.05, (now - lastRenderAt) / 1000));
          renderNonBlocking();
          lastRenderAt = now;
        }
      }

      requestAnimationFrame(frame);
    };
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
