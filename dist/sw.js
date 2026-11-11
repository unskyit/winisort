const CACHE_VERSION = 'winisort-shell-v1.0.0';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './fonts/WiniSans-Regular.woff2',
  './fonts/WiniSans-Bold.woff2',
  './vendor/pdf.js',
  './vendor/pdf.worker.js'
];

// Never cache user media, blob URLs, or non-GET requests
function isAppShellAsset(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return false;
  if (parsed.origin !== self.location.origin) return false;
  const path = parsed.pathname;
  return (
    path.endsWith('/') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.woff2') ||
    path.endsWith('.webmanifest') ||
    path.includes('/icons/') ||
    path.includes('/vendor/') ||
    path.includes('/assets/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch(() => {
        // Gracefully handle individual optional paths in dev/subpath environments
        return Promise.allSettled(APP_SHELL_ASSETS.map((u) => cache.add(u)));
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION && key.startsWith('winisort-shell-')) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!isAppShellAsset(event.request.url)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
