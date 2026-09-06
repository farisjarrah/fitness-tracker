const CACHE = "fitness-tracker-v1";
const PRECACHE = ["./", "index.html", "css/base.css", "css/app.css", "css/tools.css", "js/shared/util.js", "js/shared/charts.js", "js/shared/ui.js", "js/registry.js", "js/tools/climb.js", "js/tools/run.js", "js/tools/calorie.js", "js/main.js", "manifest.json", "icon.png"];

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

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(match => match || caches.match("./")))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(match => match || fetch(request))
  );
});