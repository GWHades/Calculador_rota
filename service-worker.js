const CACHE_NAME = "rota-v2";
const urlsToCache = [
  "index.html",
  "offline.html",
  "manifest.json",
  "version.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "script.js",
  "https://unpkg.com/leaflet/dist/leaflet.js",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/@mapbox/polyline@1.1.1/src/polyline.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => caches.match("offline.html"));
    })
  );
});
