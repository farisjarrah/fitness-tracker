const CACHE = "fitness-tracker-v2";
const PRECACHE = ["./", "index.html", "css/base.css", "css/app.css", "css/tools.css", "js/shared/util.js", "js/shared/charts.js", "js/shared/ui.js", "js/registry.js", "js/tools/climb.js", "js/tools/run.js", "js/tools/calorie.js", "js/tools/health.js", "js/main.js", "manifest.json", "icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first for everything: refreshes always pick up the latest
   files, with the cache as an offline fallback. Bump CACHE above to
   force a full re-precache on deploy. */
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(match => match || caches.match("./")))
  );
});