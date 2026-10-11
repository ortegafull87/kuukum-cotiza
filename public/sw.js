// Service worker: guarda la app para usarla sin internet. La API nunca se cachea.
const VERSION = "0.4.4";   // la cambia scripts/bump-version.mjs (igual que version.json, APP_VERSION y los ?v= de index.html y los módulos)
const CACHE = "kuukum-cotiza-" + VERSION;
const V = "?v=" + VERSION;
// / y no /index.html: Cloudflare redirige /index.html -> / (308) y Safari rechaza una respuesta con redirección para navegar.
// JS y CSS con ?v=: cada versión tiene sus propias URLs, así nunca se mezcla index.html nuevo con módulos viejos.
const SHELL = ["/", "/manifest.webmanifest", "/styles.css" + V,
  ...["app", "calc", "canonical", "catalog", "store", "pdf", "scanner", "diagnostics"].map((m) => `/js/${m}.js${V}`),
  ...["jspdf.umd.min", "jspdf.plugin.autotable.min", "qrcode", "jsQR"].map((m) => `/vendor/${m}.js${V}`),
  // Logo e íconos del PDF con ?v= (como los pide pdf.js); el logo también sin versión para los <img> de la app.
  "/img/logo.png", "/img/logo.png" + V,
  ...["whatsapp", "telefono", "email", "web", "instagram", "facebook", "tiktok"].map((n) => `/img/redes/${n}.png${V}`),
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});
// Borra TODAS las cachés que no sean la de esta versión.
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// "Actualizar" en la app: activa la versión en espera.
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

// Safari no acepta respuestas marcadas como redirigidas: se reconstruyen sin la marca.
async function clean(r) {
  if (!r || !r.redirected) return r;
  return new Response(await r.blob(), { headers: r.headers, status: r.status, statusText: r.statusText });
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname === "/version.json") return;
  // Navegación: siempre red primero; sin red, el "/" guardado.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(clean).catch(async () => clean(await caches.match("/")) || Response.error()));
    return;
  }
  // Lo demás: red primero (para recibir actualizaciones) y caché sin conexión.
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return clean(r);
  }).catch(async () => clean((await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }))) || Response.error()));
});
