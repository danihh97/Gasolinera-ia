const V = "v2", STATIC = "ahorrafuel-static-" + V, PAGES = "ahorrafuel-pages-" + V, OFFLINE = "/offline.html";
const PRECACHE = ["/", "/offline.html", "/manifest.json", "/styles.css", "/app.js", "/mascota.webp", "/IMG_6106.png", "/favicon-192x192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("ahorrafuel-") && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  // Solo recursos propios; las APIs y los precios nunca se guardan en caché
  if (u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") return e.respondWith(page(r, u));
  if (["style", "script", "image", "font", "manifest"].includes(r.destination) || /\.(?:css|js|webp|png|ico|svg|json)$/.test(u.pathname)) e.respondWith(asset(e, r));
});

// Páginas: red primero; sin conexión, la última copia o la pantalla offline
async function page(r, u) {
  const c = await caches.open(PAGES);
  try {
    const res = await fetch(r);
    if (res.ok && !res.redirected) c.put(u.pathname, res.clone());
    return res;
  } catch {
    return (await c.match(u.pathname)) || (await caches.match("/")) || (await caches.match(OFFLINE)) || Response.error();
  }
}

// Archivos estáticos: salen de la caché al instante y se actualizan en segundo plano
async function asset(e, r) {
  const c = await caches.open(STATIC), hit = await c.match(r);
  const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  try { return await net; } catch { return (await c.match(r, { ignoreSearch: true })) || Response.error(); }
}
