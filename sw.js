// 健康提醒 — Service Worker (offline cache + PWA)

const CACHE = 'health-reminder-v7';
const URLS = [
  '/health-reminder/',
  '/health-reminder/index.html',
  '/health-reminder/css/app.css',
  '/health-reminder/js/app.js',
  '/health-reminder/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // network-first: always try network, fall back to cache
  event.respondWith(
    fetch(event.request).then(response => {
      // update cache with fresh response
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
