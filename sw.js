const CACHE = 'cast-7-v50';
const FILES = ['./','index.html','privacy.html?v=50','styles.css?v=50','ui-enhancements.css?v=50','app.js?v=50','rules.js?v=50','cast-config.js?v=50','cast-sender.js?v=50','manifest.webmanifest?v=50','icon-192.png?v=50','icon-512.png?v=50','icon-maskable-512.png?v=50','assets/fire-v2.webp','assets/frost-v2.webp','assets/electric-v2.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const isShell = request.mode === 'navigate' || new URL(request.url).origin === self.location.origin;
  if (!isShell) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? './' : request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(hit => hit || caches.match('./'))));
});
