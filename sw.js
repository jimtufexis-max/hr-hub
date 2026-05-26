// HR Hub Service Worker v20260526
// This version clears all old caches and does NOT cache the HTML file
const CACHE_NAME = 'hr-hub-v20260526';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // NEVER cache HTML — always fetch fresh
  if(url.pathname.endsWith('.html') || url.pathname === '/'){
    event.respondWith(
      fetch(event.request, {cache:'no-store'}).catch(() => caches.match(event.request))
    );
    return;
  }
  // Everything else: network first, no caching
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
