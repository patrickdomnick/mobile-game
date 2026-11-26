const CACHE_NAME = 'pearl-loom-v19';
const CORE_PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.json',
  './levels.json',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-512.png',
  './game.wasm',
];

/**
 * Atomically precaches index.html, its exact content-hashed JS/CSS bundles, and game.wasm
 * using `cache: 'no-cache'` so GitHub Pages' HTTP cache can never serve a mismatched
 * half-old / half-new bundle on iOS standalone PWAs!
 */
async function precacheAtomicBundle() {
  const cache = await caches.open(CACHE_NAME);
  const urls = new Set(CORE_PRECACHE_URLS);

  try {
    const htmlRes = await fetch(new Request('./index.html', { cache: 'no-cache' }));
    if (htmlRes.ok) {
      const htmlText = await htmlRes.clone().text();
      await cache.put('./index.html', htmlRes.clone());
      await cache.put('./', htmlRes);

      // Extract exact hashed Vite JS/CSS bundles referenced by this index.html
      const assetRe = /(?:src|href)=["'](\.\/assets\/[^"']+)["']/g;
      let m;
      while ((m = assetRe.exec(htmlText)) !== null) {
        urls.add(m[1]);
      }
    }
  } catch {
    // Offline fallback — continue caching whatever is reachable
  }

  urls.delete('./');
  urls.delete('./index.html');

  await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'no-cache' }));
        if (res.ok) {
          await cache.put(url, res);
        }
      } catch {
        // Non-fatal if an optional asset is temporarily unreachable
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  // Do NOT call self.skipWaiting() automatically!
  // Let the new SW finish atomically caching and wait cleanly until the user taps "Update"
  // (preventing mid-session cache deletion & mismatched HTML/CSS/WASM loads).
  event.waitUntil(precacheAtomicBundle());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache version.json update probes
  if (url.pathname.endsWith('/version.json') || url.pathname === '/version.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Content-hashed Vite assets (/assets/*) are immutable -> cache-first for instant offline/reload loads!
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const fresh = await fetch(event.request);
        if (fresh.ok) {
          cache.put(event.request, fresh.clone());
        }
        return fresh;
      }),
    );
    return;
  }

  // Navigation (HTML), WASM, and live JSON configs: network-first bypassing stale HTTP caches,
  // with atomic cache fallback for 100% offline play!
  const isNav = event.request.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const fresh = await fetch(new Request(event.request, { cache: 'no-cache' }));
        if (fresh.ok) {
          cache.put(isNav ? './index.html' : event.request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = (await cache.match(event.request)) || (isNav ? await cache.match('./index.html') : undefined);
        if (cached) return cached;
        throw new Error('Offline and not cached');
      }
    }),
  );
});
