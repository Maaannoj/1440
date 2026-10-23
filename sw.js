// 1440 · service worker: lets the app open offline, and shows reminder notifications.
// Network first (so updates arrive right away), cached copy when offline.
const VERSION = '1440-v6-board';
const SHELL = [
  './', './index.html', './styles.css', './worlds.css', './config.js', './manifest.webmanifest',
  './vendor/supabase.js',
  './js/app.js', './js/views.js', './js/store.js', './js/backend.js', './js/logic.js', './js/themes.js', './js/fx.js', './js/audio.js', './js/worlds.js', './js/tutorial.js',
  './fonts/audiowide-latin-400-normal.woff2', './fonts/baloo-2-latin-600-normal.woff2', './fonts/baloo-2-latin-800-normal.woff2', './fonts/bangers-latin-400-normal.woff2', './fonts/bungee-latin-400-normal.woff2', './fonts/caveat-latin-600-normal.woff2', './fonts/caveat-latin-700-normal.woff2', './fonts/chakra-petch-latin-500-normal.woff2', './fonts/chakra-petch-latin-600-normal.woff2', './fonts/chakra-petch-latin-700-normal.woff2', './fonts/comic-neue-latin-700-normal.woff2', './fonts/exo-2-latin-500-normal.woff2', './fonts/exo-2-latin-700-normal.woff2', './fonts/fredoka-latin-600-normal.woff2', './fonts/fredoka-latin-700-normal.woff2', './fonts/jetbrains-mono-latin-400-normal.woff2', './fonts/jetbrains-mono-latin-700-normal.woff2', './fonts/michroma-latin-400-normal.woff2', './fonts/nunito-latin-600-normal.woff2', './fonts/nunito-latin-800-normal.woff2', './fonts/orbitron-latin-700-normal.woff2', './fonts/orbitron-latin-900-normal.woff2', './fonts/oxanium-latin-400-normal.woff2', './fonts/oxanium-latin-600-normal.woff2', './fonts/oxanium-latin-800-normal.woff2', './fonts/patrick-hand-latin-400-normal.woff2', './fonts/permanent-marker-latin-400-normal.woff2', './fonts/pixelify-sans-latin-500-normal.woff2', './fonts/pixelify-sans-latin-700-normal.woff2', './fonts/press-start-2p-latin-400-normal.woff2', './fonts/quicksand-latin-600-normal.woff2', './fonts/quicksand-latin-700-normal.woff2', './fonts/rajdhani-latin-500-normal.woff2', './fonts/rajdhani-latin-600-normal.woff2', './fonts/rajdhani-latin-700-normal.woff2', './fonts/righteous-latin-400-normal.woff2', './fonts/saira-condensed-latin-600-normal.woff2', './fonts/saira-condensed-latin-700-normal.woff2', './fonts/saira-condensed-latin-800-normal.woff2', './fonts/share-tech-mono-latin-400-normal.woff2', './fonts/shippori-mincho-latin-500-normal.woff2', './fonts/shippori-mincho-latin-700-normal.woff2', './fonts/sniglet-latin-400-normal.woff2', './fonts/sniglet-latin-800-normal.woff2', './fonts/teko-latin-500-normal.woff2', './fonts/teko-latin-600-normal.woff2', './fonts/vt323-latin-400-normal.woff2', './fonts/zen-kaku-gothic-new-latin-500-normal.woff2',
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

// ---------- reminders ----------
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const shown = self.registration.showNotification(d.title || '1440', {
    body: d.body || 'Check your quests.',
    tag: d.tag || '1440',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: d.url || './' },
  });
  let badge = null;
  const nav = self.navigator;
  if (typeof d.badge === 'number' && nav && 'setAppBadge' in nav) {
    badge = (d.badge > 0 ? nav.setAppBadge(d.badge) : nav.clearAppBadge()).catch(() => {});
  }
  event.waitUntil(Promise.all([shown, badge]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { await w.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
