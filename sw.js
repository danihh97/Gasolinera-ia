const CACHE_NAME = "ahorrafuel-pwa-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Solo peticiones GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // No interferir con las APIs de AhorraFuel
  if (url.pathname.startsWith("/api/")) return;

  // No guardar precios ni respuestas dinámicas en caché
  event.respondWith(fetch(request));
});
