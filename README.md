# Kuukum Cotiza (v0.3)

Especificaciones: [`docs/SPEC-v0.2.md`](docs/SPEC-v0.2.md), [`docs/SPEC-v0.3.md`](docs/SPEC-v0.3.md).

App web instalable (PWA) para cotizar desde el teléfono, con o sin internet. Sincroniza clientes y cotizaciones con Odoo y comparte el PDF por WhatsApp.

- **Frontend**: `public/`. HTML/JS sin build. Funciona offline gracias al service worker.
- **API**: `functions/api/`, sobre Cloudflare Pages Functions. Hace el login con Google, el sync con Odoo (JSON-2) y la verificación de sellos.
- **Datos en Cloudflare**: un KV llamado `KK` guarda la configuración, la idempotencia del sync, los sellos y el último folio de cada usuario.

## 1. Google Cloud (proyecto "Kuukum Cotiza")
En la credencial OAuth (tipo Aplicación web, Client ID `273765990336-id4d6…`):
- **Orígenes de JavaScript autorizados**: `https://cotiza.kuukum.mx` y `https://kuukum-cotiza.pages.dev`.
- **URI de redireccionamiento autorizados**: `https://cotiza.kuukum.mx/api/auth/google` y `https://kuukum-cotiza.pages.dev/api/auth/google`.
- **Pantalla de consentimiento**: tipo Externa, con los scopes `openid`, `email` y `profile`. Puedes publicarla a Producción porque estos scopes no requieren verificación de Google.

## 2. Odoo
Loida entra a **Mis preferencias → Seguridad de la cuenta → Nueva clave API**. Le pone de nombre "Kuukum Cotiza". La clave va directo a Cloudflare (paso 3). No la mandes por chat ni la guardes en el repo.

## 3. Cloudflare
```bash
npm install
npx wrangler login
npx wrangler kv namespace create KK          # copia el id a wrangler.toml
npx wrangler pages project create kuukum-cotiza --production-branch main
npx wrangler pages secret put ODOO_API_KEY   --project-name kuukum-cotiza
npx wrangler pages secret put SESSION_SECRET --project-name kuukum-cotiza   # openssl rand -base64 32
npx wrangler pages secret put SEAL_SECRET    --project-name kuukum-cotiza   # openssl rand -base64 32
npm run deploy
```
**`SEAL_SECRET` no se cambia nunca.** Si cambia, los sellos de todas las cotizaciones anteriores dejan de verificar. Guárdalo en tu gestor de contraseñas.

Para `SESSION_SECRET` la regla es otra: cambiarlo cierra la sesión de todos los usuarios, nada más.

## 4. Subdominio en IONOS
1. En Cloudflare: **Pages → kuukum-cotiza → Custom domains → Add**, y escribes `cotiza.kuukum.mx`.
2. En el DNS de IONOS: crea un registro **CNAME** `cotiza` → `kuukum-cotiza.pages.dev`.
3. Espera a que Cloudflare muestre el dominio como *Active*. El SSL se emite solo.

## 5. Instalar en el iPhone
1. Abre `https://cotiza.kuukum.mx` en **Safari** y entra con Google.
2. Toca Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde el ícono. A partir de ahí funciona sin internet.

Primera prueba recomendada: entrar con Google **desde el ícono instalado**. iOS maneja las PWAs instaladas con su propio almacenamiento. Si el login no regresa a la app, entra primero desde Safari y luego agrégala a la pantalla de inicio.

## Cómo funciona
- **Folios**: `AP-` + la letra del usuario + un consecutivo (`AP-L0012`); las cotizaciones anteriores conservan `KK-L0012` y siguen funcionando (QR, Verificar, revisiones). El consecutivo es uno por usuario para los dos prefijos: después de `KK-K0005` sigue `AP-K0006`. El prefijo vive en `FOLIO_PREFIX` (`public/js/canonical.js`). Al sincronizar, Odoo le asigna su número `S000xx` y el folio de la app queda en *Referencia del cliente*.
- **Sync**: guarda todo en el teléfono y lo sube a Odoo en cuanto hay internet. Ocurre al abrir la app, al recuperar la conexión, cada minuto si hay pendientes, o tocando el indicador de sync. Es idempotente: reintentar no duplica cotizaciones en Odoo.
- **Qué crea en Odoo**:
  - `sale.order` en borrador, con cliente, canal (`source_id`), vigencia, términos, líneas con descuento, IVA (impuesto id 14) y costo (`purchase_price`).
  - Se marca como **Enviada** cuando se comparte el PDF.
  - Los clientes nuevos se buscan por teléfono y, si no existen, se crean.
  - Las líneas de "Producto libre" usan el producto `KK-LIBRE`, que se crea solo la primera vez.
- **Sello**: HMAC-SHA256 del contenido (folio, fecha, cliente, partidas, descuento, IVA, total y anticipo), con una llave derivada por usuario. La llave vive en el teléfono como `CryptoKey` no extraíble. La pantalla **Ajustes → Verificar sello** muestra lo que realmente se cotizó. El QR del PDF es texto plano (`KUUKUM|V1|<folio>|<sello>`), no un enlace: el cliente no llega a la app. Desde Verificar, **Escanear QR** lo lee con la cámara o desde una foto/captura (jsQR local, funciona sin internet). También lee el QR viejo con URL.
- **Catálogo**: los chips (prenda, género, material, color, talla, técnica, ubicación) salen del nombre de cada producto en Odoo. Se ocultan los gastos internos y los productos con precio ≤ $1 o más de 20 veces su costo. La lista de ocultos aparece en Ajustes.
- **Revisiones**: en Detalle, **Editar** abre el asistente con una copia de la cotización. Al guardarla se crea la revisión N+1 con el mismo folio (`KK-L0012-R2`, `-R3`…) y se actualiza la misma `S000xx` en Odoo: se reemplazan las líneas y queda una nota interna en el historial con el total de antes y el de ahora. Si en Odoo ya es pedido o está cancelada, no se toca y la app ofrece **Duplicar**. Los cambios hechos directamente en Odoo no regresan a la app: si alguien edita allá, Odoo manda.
- **Sellos de revisiones**: la rev 1 usa el canónico `kk-v1` (no cambia) y las revisiones usan `kk-v2` (`kk-v1` + `rev:N`). **Verificar** reconoce un sello de una revisión anterior y muestra los dos totales.
- **Correo desde Odoo**: solo para clientes cautivos, es decir, con correo y al menos un pedido confirmado (cuentan también los contactos de la misma empresa). La app lo ofrece en el Paso 4 y en Detalle, y el servidor vuelve a validar la regla. El PDF de la app se adjunta a la `S000xx` y Odoo manda el correo con la plantilla de **Ajustes → Correo**. Sin internet queda en cola y se manda después de subir la cotización.
- **Reportar un problema**: en **Ajustes → Ayuda**. Asigna un ID `CT-0001`, guarda el ticket en KV (`ticket:<ID>`, sin fotos) y lo manda por correo vía Odoo (`mail.mail`) a la variable de entorno `REPORTES_EMAIL` (en `wrangler.toml` → `[vars]`, hoy `hola@kuukum.mx`; si falta, la API responde 500 y el reporte queda guardado para reintentar). El remitente es el de Odoo (`notifications@kuukum.odoo.com`) y "Responder" va a quien reportó. Lo manda con las fotos adjuntas y un bloque `---ticket---` para un futuro sistema de tickets. Sin internet queda en cola (IndexedDB).
- **Íconos del PDF**: `public/img/redes/` (WhatsApp, Instagram, Facebook y TikTok con los glifos oficiales de Simple Icons, CC0, y un globo para el sitio web) se generan con `node scripts/build-redes-icons.mjs` (devDependencies `sharp` y `simple-icons`). Los PNG se commitean; el deploy no los genera.
- **Estado en Odoo**: la app consulta (`POST /api/estado`) el estado de las cotizaciones ya subidas al abrir la lista, al volver a primer plano y después de cada sync, como máximo una vez cada 5 min. Jalar la lista hacia abajo o tocar el estado en Detalle consulta en ese momento. Muestra "Pedido confirmado" (sin Editar), "Cancelada en Odoo" o "Eliminada en Odoo" (atenuadas, solo Duplicar, Ocultar y, si existe, Abrir en Odoo). Odoo manda: la app solo lee el estado, nunca lo cambia. Ocultar solo la quita de la lista en ese teléfono ("Ver ocultas").
- **Versiones**: `public/version.json`, `APP_VERSION` de `app.js`, `VERSION` de `sw.js` y los `?v=` de `index.html` y de los `import` deben coincidir. Antes de cada deploy con cambios en `public/` corre `node scripts/bump-version.mjs` (o `minor`, `major`, `X.Y.Z`). No edites `version.json` a mano: `node scripts/check-version.mjs` (`npm run check:version`, corre solo antes de `npm run deploy`) falla si las versiones no coinciden. En Cloudflare Pages ponlo como **Build command** para que un push desalineado no se publique. Además corre solo antes de cada commit (hook `.githooks/pre-commit`, que `npm install` activa con `git config core.hooksPath .githooks`). Cada versión pide sus archivos con URLs propias, así el navegador nunca mezcla dos versiones. La app revisa `version.json` al abrir, al volver a primer plano y cada 30 min, y muestra el aviso **Actualizar**.
- **Caché del dominio**: en Cloudflare, zona `kuukum.mx` → Caching → Configuration → **Browser Cache TTL = "Respect Existing Headers"**. Con el valor por defecto (4 h), Cloudflare reescribe los `no-cache` de `_headers` a `max-age=14400` en `cotiza.kuukum.mx`; así se mezclaron versiones en la 0.3.2. En `*.pages.dev` no pasa.
- **Red de seguridad**: si la app no arranca en 6 s, aparece **Reparar y recargar**. Borra solo el service worker y Cache Storage, nunca las cotizaciones, el borrador ni la llave del sello. El script vive en línea en `index.html` y su hash va en la CSP de `_headers`; si lo cambias, `npm run e2e` avisa que hay que actualizar el hash.
- **Diagnóstico**: los reportes llevan el diagnóstico de `public/js/diagnostics.js` (app, datos, dispositivo y últimos 30 errores de `kk_errlog`), más hora, commit y país/colo que agrega el servidor. Va en tablas en el correo y completo en `diagnostico-CT-000N.json`. Nunca lleva ubicación, cookies, tokens ni la llave del sello.
- **Configuración**: el correo, los teléfonos, las redes, el banco, el anticipo, la entrega, los términos y los correos con acceso se editan en **Ajustes** y aplican para todos.

## Desarrollo local
```bash
printf 'ODOO_API_KEY=...\nSESSION_SECRET=dev\nSEAL_SECRET=dev\n' > .dev.vars
npx wrangler pages dev public
```
El login con Google no funciona en `localhost` a menos que lo agregues como origen y redirect en la credencial.

### Logs del servidor
- **En vivo**: `npx wrangler pages deployment tail --project-name kuukum-cotiza`, o en el panel: Workers & Pages → kuukum-cotiza → logs en tiempo real de Functions. Cada petición deja una línea JSON: `{ts, requestId, method, ruta, status, ms, usuario, folio?, odoo:[{modelo, metodo, ms, ok, error?}], error?}`.
- **Historial**: Ajustes → **Registro del servidor** (`GET /api/errores`). Muestra los últimos 50 errores con status ≥ 500 o fallo de Odoo, guardados en KV (`errlog:…`, 30 días).
- **Correlación**: toda respuesta lleva `x-request-id`, y los errores también lo traen en el cuerpo (`{error, requestId}`). En la app, los errores del servidor muestran "(ref 8c1f2a)". El `requestId` completo queda en `kk_errlog` y viaja en el diagnóstico de los reportes, así que un ticket se cruza con el log por ese código. Es la parte hexadecimal del `cf-ray` de Cloudflare.
- No se registran la API key, cookies, sellos ni llaves, PDF, fotos ni datos personales. Del cliente solo queda su id de Odoo.

### Pruebas locales (sin tocar el Odoo real)
```bash
npm run mock-odoo                      # Odoo simulado en :8069 (estado en memoria, GET /__state para inspeccionarlo)
npx wrangler pages dev public --port 8788 --persist-to /tmp/kk-kv \
  --binding ODOO_URL=http://localhost:8069 --binding ODOO_API_KEY=test \
  --binding SESSION_SECRET=dev --binding SEAL_SECRET=dev
npm run e2e                            # firma sesión y sellos con SESSION_SECRET/SEAL_SECRET=dev
```
Para abrir la app en el navegador sin Google, crea la cookie `kk_session` con `makeSession({SESSION_SECRET:"dev"}, correo, nombre)` de `lib/core.js`.
