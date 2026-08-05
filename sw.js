const CACHE = 'flipcast-v65';
const FILES = ['./','index.html','privacy.html?v=65','update.html?v=65','styles.css?v=65','ui-enhancements.css?v=65','app.js?v=65','rules.js?v=65','cast-config.js?v=65','cast-sender.js?v=65','manifest.webmanifest?v=65','icon-192.png?v=65','icon-512.png?v=65','icon-maskable-512.png?v=65','icon.svg?v=65','icon-maskable.svg?v=65','assets/fire-v3.webp','assets/frost-v3.webp','assets/electric-v3a.webp','assets/electric-v3b.webp'];
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
