const CACHE_NAME = "indivino-step1-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./registrazione.html",
  "./cliente.html",
  "./css/style.css",
  "./js/app.js",
  "./images/logo-proloco-solofra.png",
  "./images/logo-indivino-2026.png",
  "./images/icon-192.png",
  "./images/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
