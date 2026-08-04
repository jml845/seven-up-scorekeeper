const CACHE = 'cast-7-v59';
const FILES = ['./','index.html','privacy.html?v=59','update.html?v=59','styles.css?v=59','ui-enhancements.css?v=59','app.js?v=59','rules.js?v=59','cast-config.js?v=59','cast-sender.js?v=59','manifest.webmanifest?v=59','icon-192.png?v=59','icon-512.png?v=59','icon-maskable-512.png?v=59','assets/fire-v3.webp','assets/frost-v3.webp','assets/electric-v3a.webp','assets/electric-v3b.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const isShell = request.mode === 'navigate' || new URL(request.url).origin === self.location.origin;
  if (!isShell) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(hit => hit || (request.mode === 'navigate' ? caches.match('./') : undefined))));
});
