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

export function setupSafariPwaShell(): void {
  // Prevent iOS Safari pinch-zoom gestures and rubber-band scrolling during gameplay
  const preventGesture = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        // Non-fatal in restricted dev environments
      });
    });
  }
}
