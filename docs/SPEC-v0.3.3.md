# Cotiza App · v0.3.3 — Pantalla oscura al actualizar + remitente de reportes

Aplican las "Reglas que no se rompen" de `docs/SPEC-v0.2.md`.

## Diagnóstico de la pantalla oscura (0.3.1 → 0.3.2, iPhone, app instalada)
**Causa: versiones mezcladas (sospechoso 2).** En `cotiza.kuukum.mx`, los JS/CSS se servían con `Cache-Control: max-age=14400`
aunque `_headers` pide `no-cache`: la zona `kuukum.mx` de Cloudflare tiene **Browser Cache TTL = 4 h**, que reescribe los headers
(en `kuukum-cotiza.pages.dev` llegan con `no-cache`). Con 4 h de caché sin revalidar, el iPhone podía ejecutar `app.js` 0.3.2,
que importa `parseMoney` (nuevo en 0.3.2), junto con `calc.js` 0.3.1, que no lo tiene. El import falla, no arranca ningún módulo
y solo queda el color de fondo. En local se reprodujo el mismo efecto con un `app.js` que importa algo inexistente de `calc.js`. No se pudo probar en un iPhone real.

**Sospechoso 1 (redirección): latente, también corregido.** Cloudflare responde `/index.html` con 308 → `/` (también en `wrangler pages dev`).
El SW precacheaba `/index.html` (respuesta con `redirected: true`) y la usaba como respaldo de navegación sin red.

**Sospechoso 3 (carrera de recarga): poco probable.** El SW nuevo se activa solo al instalarse, así que **Actualizar** casi siempre recarga directo. Aun así, ahora la recarga es única y con límite de 3 s.

## Cambios
- `?v=<versión>` en todos los JS/CSS de `index.html` y en todos los `import` entre módulos (`bump-version.mjs` los cambia juntos):
  cada versión tiene URLs propias y no puede mezclarse con archivos de otra.
- `sw.js`: precachea `/` y no `/index.html`; reconstruye respuestas con `redirected`; navegación con red primero y respaldo en `/`;
  `activate` borra todas las cachés ajenas; precache con `cache: "reload"`.
- Recarga por actualización: intenta subir lo pendiente (máx 5 s), recarga una sola vez (`controllerchange` o 3 s).
- Red de seguridad en línea en `index.html` (hash en la CSP): a los 6 s sin arrancar muestra **Reparar y recargar**, que desregistra el SW,
  borra solo Cache Storage y recarga. Nunca toca localStorage ni IndexedDB. El evento queda en `kk_errlog`.
- Ajustes → Versión: "Cotizaciones guardadas en este teléfono: N · por subir: M".
- Remitente: `email_from` explícito del dominio de Odoo (`"Cotiza App" <notifications@kuukum.odoo.com>` en reportes y
  `"<empresa>" <notifications@kuukum.odoo.com>` en cotizaciones), configurable en Ajustes → Correo. `reply_to` = quien reporta.
  Antes no se mandaba `email_from` y Odoo usaba el contacto del usuario de la API (`"loidaegr@gmail.com" <kuukum.mx@gmail.com>`).

## Pendiente fuera del código
Cloudflare → zona `kuukum.mx` → Caching → Configuration → Browser Cache TTL → **Respect Existing Headers**.
