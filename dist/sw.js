// Offline support. The quiet room must open with no network, so its files are stored on install.
// Pages are fetched fresh when online (so updates arrive) and fall back to the stored copy offline.
// Other files are served from storage first and refreshed in the background.
const VERSION = 'still-v2';
const PRECACHE = [
  './', 'quiet.html', 'journal.html', 'profile.html', 'index.html',
  'style.css', 'quiet.css', 'journal.css', 'profile.css',
  'quiet.js', 'journal.js', 'journal-store.js', 'profile.js', 'comfort-engine.js', 'preference-model.js',
  'app.js', 'audio-engine.js', 'comfort-data.js', 'pwa.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One at a time, so a single missing file cannot block the rest.
    await Promise.all(PRECACHE.map(path => cache.add(new Request(path, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok && !fresh.redirected) (await caches.open(VERSION)).put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request, { ignoreSearch: true })) || (await caches.match('quiet.html')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    const refresh = fetch(request).then(res => { if (res.ok && !res.redirected) cache.put(request, res.clone()); return res; }).catch(() => null);
    if (cached) { event.waitUntil(refresh); return cached; }
    return (await refresh) || Response.error();
  })());
});
