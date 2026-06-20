// Service worker — offline cache (app shell only; data lives in IndexedDB)
const CACHE = "trade-journal-v1";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/db.js", "./js/trades.js", "./js/tier.js", "./js/stats.js", "./js/ui.js", "./js/app.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  e.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(res => {
        // cache same-origin GETs (not the CDN font/jszip — those are fine to fetch live)
        if (res.ok && request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});