const CACHE_NAME = 'superherooo-app-v3';
const APP_SHELL = [
  '/app/',
  '/app/index.html',
  '/app/manifest.citizen.webmanifest',
  '/app/manifest.partner.webmanifest',
  '/app/icons/icon-citizen-192.png',
  '/app/icons/icon-citizen-512.png',
  '/app/icons/icon-partner-192.png',
  '/app/icons/icon-partner-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin.includes('mysuperhero.xyz') || url.pathname.startsWith('/socket.io')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/app/index.html')));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/app/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
