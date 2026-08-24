/* Bea’s Course Builder — the service worker.

   Its whole job is to make the app open with no signal, which matters because
   she will be standing in a field with the jumps.

   The version below is bumped by hand, and tests/precache.test.js checks that
   every file that ships is listed here. That test exists because the classic
   offline bug is adding a file, forgetting this list, and everything working
   perfectly until someone is somewhere without a signal. */

const VERSION = '2026-08-24-3';
/* `bcb` is the app's old misspelled initials. Left alone on purpose — see the
   note on the storage keys in lib/store.js. */
const CACHE = 'bcb-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './print.css',
  './manifest.webmanifest',
  './data/sources.js',
  './data/levels.js',
  './data/jumps.js',
  './data/arenas.js',
  './data/distances.js',
  './lib/geometry.js',
  './lib/turns.js',
  './lib/strides.js',
  './lib/route.js',
  './lib/course.js',
  './lib/store.js',
  './lib/render.js',
  './lib/interact.js',
  './lib/share.js',
  './lib/photo.js',
  './lib/ui.js',
  './lib/editor.js',
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
  })());
  /* Deliberately no skipWaiting here: a new version takes over only when she
     taps Reload, so a course being edited is never yanked away mid-edit. */
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE && name.startsWith('bcb-')) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations are served from the cache straight away so the app opens
     instantly and works offline, and refreshed quietly in the background. */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const network = fetch(request).then(response => {
        if (response.ok) cache.put('./index.html', response.clone());
        return response;
      }).catch(() => null);
      return cached || (await network) || new Response(
        '<h1>Offline</h1><p>Open the app once while you have signal.</p>',
        { headers: { 'Content-Type': 'text/html' } });
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
