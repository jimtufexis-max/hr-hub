// Service Worker v11 — network first, cache bust
const CACHE = 'hr-hub-v11';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Always network first — never serve stale HTML
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
