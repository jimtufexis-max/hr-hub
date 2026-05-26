// KILL SWITCH - unregisters self and clears all caches
// The browser always fetches sw.js fresh to check for updates
self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({includeUncontrolled:true, type:'window'}))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});
// Pass ALL requests through to network - no caching
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request.clone()));
});
