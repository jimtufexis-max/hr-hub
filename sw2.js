// sw2.js — kills all old service workers and caches
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
      self.registration.unregister(),
    ]).then(() => self.clients.matchAll({includeUncontrolled:true}))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});
self.addEventListener('fetch', event => {
  // Pass everything through — no caching
  event.respondWith(fetch(event.request, {cache:'no-store'}));
});
