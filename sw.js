const CACHE_NAME = ‘hr-hub-v10’;
const APP_SHELL = [’/hr-hub/hr_hub.html’];

self.addEventListener(‘install’, e => {
e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)));
self.skipWaiting();
});

self.addEventListener(‘activate’, e => {
e.waitUntil(
caches.keys().then(keys =>
Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
)
);
self.clients.claim();
});

self.addEventListener(‘fetch’, e => {
const url = new URL(e.request.url);
const isAPI = url.hostname.includes(‘statsapi.mlb.com’) ||
url.hostname.includes(‘workers.dev’) ||
url.hostname.includes(‘open-meteo.com’) ||
url.hostname.includes(‘the-odds-api.com’);
if(isAPI){
e.respondWith(fetch(e.request).catch(()=>new Response(’{“error”:“offline”}’,{headers:{‘Content-Type’:‘application/json’}})));
return;
}
// Network first for HTML — always get latest
if(e.request.destination === ‘document’){
e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
return;
}
e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
