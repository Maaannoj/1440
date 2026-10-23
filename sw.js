// 1440 · service worker: lets the app open offline.
// Network first (so updates arrive right away), cached copy when offline.
const VERSION = '1440-v3-audio';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './vendor/supabase.js',
  './js/app.js', './js/views.js', './js/store.js', './js/backend.js', './js/logic.js', './js/themes.js', './js/fx.js', './js/audio.js',
  './fonts/chakra-petch-latin-500-normal.woff2', './fonts/chakra-petch-latin-600-normal.woff2', './fonts/chakra-petch-latin-700-normal.woff2',
  './fonts/share-tech-mono-latin-400-normal.woff2', './fonts/rajdhani-latin-500-normal.woff2', './fonts/rajdhani-latin-600-normal.woff2',
  './fonts/rajdhani-latin-700-normal.woff2', './fonts/oxanium-latin-400-normal.woff2', './fonts/oxanium-latin-600-normal.woff2',
  './fonts/oxanium-latin-800-normal.woff2', './fonts/vt323-latin-400-normal.woff2', './fonts/jetbrains-mono-latin-400-normal.woff2',
  './fonts/jetbrains-mono-latin-700-normal.woff2', './fonts/michroma-latin-400-normal.woff2',
  './fonts/righteous-latin-400-normal.woff2', './fonts/bungee-latin-400-normal.woff2', './fonts/saira-condensed-latin-600-normal.woff2',
  './fonts/saira-condensed-latin-700-normal.woff2', './fonts/saira-condensed-latin-800-normal.woff2', './fonts/teko-latin-500-normal.woff2',
  './fonts/teko-latin-600-normal.woff2', './fonts/orbitron-latin-700-normal.woff2', './fonts/orbitron-latin-900-normal.woff2',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase calls go straight to the network

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const fresh = await fetch(req, { cache: 'no-cache' });
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
