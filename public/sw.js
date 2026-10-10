// Service worker: guarda la app para usarla sin internet. La API nunca se cachea.
const CACHE = "kuukum-cotiza-v2-6";
const SHELL = ["/", "/index.html", "/styles.css", "/manifest.webmanifest",
  "/js/app.js", "/js/calc.js", "/js/canonical.js", "/js/catalog.js", "/js/store.js", "/js/pdf.js",
  "/vendor/jspdf.umd.min.js", "/vendor/jspdf.plugin.autotable.min.js", "/vendor/qrcode.js",
  "/img/logo.png", "/img/redes/whatsapp.png", "/img/redes/telefono.png", "/img/redes/email.png", "/img/redes/web.png", "/img/redes/instagram.png", "/img/redes/facebook.png", "/img/redes/tiktok.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Red primero (para recibir actualizaciones), caché si no hay conexión.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || (e.request.mode === "navigate" ? caches.match("/index.html") : Response.error()))));
});
