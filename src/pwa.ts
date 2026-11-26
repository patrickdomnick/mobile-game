declare const __APP_BUILD_ID__: string | undefined;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Returns true when Pearl Loom is already running as an installed full-screen standalone PWA. */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia('(display-mode: standalone)').matches;
}

/** Returns true on iPhone / iPad (including iPadOS desktop UA). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Returns true on iOS Safari / WebKit touch devices where direct-tap switch haptics apply. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return isIosDevice() || (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia('(pointer: coarse)').matches;
}

export interface InstallPromptController {
  canTriggerNativeInstall(): boolean;
  triggerNativeInstall(): Promise<boolean>;
}

/** Hooks Chromium's native beforeinstallprompt when available (Android / Desktop Chrome). */
export function setupInstallPrompt(onChange: () => void): InstallPromptController {
  let deferred: BeforeInstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    onChange();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    onChange();
  });

  return {
    canTriggerNativeInstall: () => deferred !== null,
    triggerNativeInstall: async () => {
      if (!deferred) return false;
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        deferred = null;
        onChange();
        return choice.outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}

export interface PwaUpdateController {
  hasUpdate(): boolean;
  checkForUpdate(force?: boolean): Promise<boolean>;
  applyUpdate(): Promise<void>;
  simulateUpdateAvailable(): void;
}

const UPDATE_CHECK_MIN_INTERVAL_MS = 20_000;

/**
 * Atomic, 1-tap PWA update manager built specifically for iPhone standalone PWAs:
 * - Registers `./sw.js` with `updateViaCache: 'none'` so Safari never serves stale SW bytecode.
 * - Detects updates via BOTH Service Worker `waiting`/`updatefound` AND `./version.json` probe.
 * - Never force-reloads mid-puzzle; notifies the UI so an Update pill can appear cleanly on the
 *   Start Menu or Level Complete screen, then activates the waiting atomic bundle in 1 tap!
 */
export function setupPwaUpdateManager(onUpdateAvailable: () => void): PwaUpdateController {
  const currentBuildId = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';
  let registration: ServiceWorkerRegistration | null = null;
  let updateAvailable = false;
  let checking = false;
  let applying = false;
  let lastCheckedAt = 0;

  const markAvailable = (): void => {
    if (updateAvailable) return;
    updateAvailable = true;
    onUpdateAvailable();
  };

  const watchRegistration = (reg: ServiceWorkerRegistration): void => {
    registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) {
      markAvailable();
    }
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          markAvailable();
        }
      });
    });
  };

  if ('serviceWorker' in navigator && window.isSecureContext) {
    const registerSw = () => {
      navigator.serviceWorker
        .register('./sw.js', { scope: './', updateViaCache: 'none' })
        .then(watchRegistration)
        .catch(() => {
          // Non-fatal in restricted dev environments
        });
    };
    if (document.readyState === 'complete') {
      registerSw();
    } else {
      window.addEventListener('load', registerSw, { once: true });
    }
  }

  const checkForUpdate = async (force = false): Promise<boolean> => {
    if (updateAvailable) return true;
    if (checking || typeof navigator === 'undefined' || navigator.onLine === false) return false;
    const now = Date.now();
    if (!force && now - lastCheckedAt < UPDATE_CHECK_MIN_INTERVAL_MS) {
      return false;
    }
    checking = true;
    lastCheckedAt = now;

    try {
      // 1. Ask Service Worker to re-fetch ./sw.js bypassing HTTP cache
      if (registration) {
        await registration.update().catch(() => {});
        if (registration.waiting && navigator.serviceWorker.controller) {
          markAvailable();
          return true;
        }
      }

      // 2. Also probe ./version.json (catches updates immediately even if iOS WebKit throttled SW checks)
      if (currentBuildId) {
        const res = await fetch(`./version.json?t=${now}`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { buildId?: unknown };
          if (typeof data.buildId === 'string' && data.buildId.length > 0 && data.buildId !== currentBuildId) {
            if (registration) {
              await registration.update().catch(() => {});
            }
            markAvailable();
            return true;
          }
        }
      }
    } catch {
      // Offline or transient network error — stay completely silent
    } finally {
      checking = false;
    }
    return updateAvailable;
  };

  const applyUpdate = async (): Promise<void> => {
    if (applying) return;
    applying = true;

    const doReload = () => {
      window.location.reload();
    };

    try {
      if ('serviceWorker' in navigator) {
        if (!registration) {
          registration = (await navigator.serviceWorker.getRegistration('./')) ?? null;
        }
        // If a new SW is still installing, give it a brief moment to finish atomic precaching
        if (registration?.installing && !registration.waiting) {
          await new Promise<void>((resolve) => {
            const inst = registration!.installing!;
            const timeout = window.setTimeout(resolve, 2500);
            inst.addEventListener('statechange', () => {
              if (inst.state === 'installed' || inst.state === 'activated' || inst.state === 'redundant') {
                window.clearTimeout(timeout);
                resolve();
              }
            });
          });
        }

        if (registration?.waiting) {
          let reloaded = false;
          const finish = () => {
            if (reloaded) return;
            reloaded = true;
            doReload();
          };
          navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.setTimeout(finish, 900);
          return;
        }
      }

      // Fallback when no waiting SW exists (e.g. detected via version.json): clear stale caches & reload cleanly
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('pearl-loom-')).map((k) => caches.delete(k)));
      }
    } catch {
      // Fall through to clean reload
    }
    doReload();
  };

  return {
    hasUpdate: () => updateAvailable,
    checkForUpdate,
    applyUpdate,
    simulateUpdateAvailable: () => {
      markAvailable();
    },
  };
}

export function setupSafariPwaShell(): void {
  // Prevent iOS Safari pinch-zoom gestures and rubber-band scrolling during gameplay
  const preventGesture = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
}
