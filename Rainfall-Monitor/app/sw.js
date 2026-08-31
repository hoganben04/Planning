/* Rainfall Monitor — the service worker.

   Its job is to make the app OPEN with no signal. It is not there to make the
   readings available offline — lib/store.js does that, in localStorage, with the
   age of the numbers shown on screen.

   That split is deliberate and worth keeping. A service worker that cached
   Environment Agency responses would happily serve a two-day-old total that
   looks exactly like a fresh one, and there is no worse failure available to an
   app whose whole purpose is telling you how much it has rained. So:

     - The app's own files: cache first, because they never change without the
       version below changing.
     - Anything on environment.data.gov.uk: network only, never cached. A failed
       fetch is allowed to fail, so the app can say so and fall back to the
       stored readings with a date attached.

   The version is bumped by hand, and tests/precache.test.js checks that every
   file that ships is listed here — because the classic offline bug is adding a
   file, forgetting this list, and everything working perfectly right up until
   somebody is stood in a gateway with no signal. */

const VERSION = '2026-08-31-3';
const CACHE = 'rm-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './data/sources.js',
  './data/stations.js',
  './data/thresholds.js',
  './lib/readings.js',
  './lib/analyse.js',
  './lib/api.js',
  './lib/store.js',
  './lib/chart.js',
  './lib/ui.js',
  './lib/app.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* The version query and cache:'reload' stop the browser handing us its own
       stale copies of the very files we are trying to store fresh. */
    await Promise.all(PRECACHE.map(async url => {
      try {
        const request = new Request(url + (url.indexOf('?') < 0 ? '?v=' + VERSION : ''), { cache: 'reload' });
        const response = await fetch(request);
        if (response.ok) await cache.put(url, response);
      } catch (e) {
        /* One missing file must not stop the rest being cached. */
      }
    }));
    /* Take over as soon as the new files are stored, rather than waiting for
       every tab to be closed. Without this, clients.claim() in activate never
       runs on an open page and a fix reaches an installed copy two opens later
       — which is the wrong trade for an app whose job is warning you about
       something. Nothing here is lost by it: the settings are written the moment
       they are changed, so there is no half-finished edit to yank away. */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE && name.startsWith('rm-')) await caches.delete(name);
    }
    /* Paired with skipWaiting() in install: that gets this worker activated
       without waiting for tabs to close, this puts the already-open pages under
       it. Both are needed; either alone leaves an open page on the old bundle. */
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Never cache the readings. See the note at the top of this file. */
  if (url.hostname.endsWith('environment.data.gov.uk')) return;

  /* Anything else off-origin is not ours to cache either. */
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      /* Refresh in the background so the next open is current, without making
         this open wait for the network. */
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put(request, fresh.clone());
        } catch (e) { /* offline; the cached copy stands */ }
      })());
      return cached;
    }
    try {
      const fresh = await fetch(request);
      if (fresh.ok && url.origin === self.location.origin) {
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (e) {
      /* A navigation with nothing cached: hand back the shell so the app can at
         least open and show what it has stored. */
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
