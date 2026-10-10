# Cotiza App · v0.3 — Ajustes después de uso real

Aplican las mismas "Reglas que no se rompen" de `docs/SPEC-v0.2.md`.

## 1. QR del PDF: que NO lleve al cliente a la app
- El QR deja de ser URL y pasa a ser texto plano: `KUUKUM|V1|<folio visible con -Rn>|<sello sin guiones>`
  (ej. `KUUKUM|V1|KK-L0012|7F3A9C214B8ED015`). La cámara del iPhone solo muestra el texto; no hay enlace.
- El texto "Sello de autenticidad: …" del pie no cambia.
- El lector también acepta el formato viejo (URL con `#/verificar/FOLIO/SELLO`) de los PDFs ya enviados.

## 2. Escanear el QR desde la pantalla Verificar
Layout: texto "Escanea el código QR que aparece al pie de la cotización." → botón principal **Escanear QR** →
resultado → sección colapsable **Ingresar manualmente** (Folio, Sello y **Verificar**; se abre sola si no hay cámara).

Escáner: cámara trasera a pantalla completa (`getUserMedia({video:{facingMode:"environment"}})`), recuadro guía, ayuda,
**Cancelar** y enlace **Usar una foto o captura** (`<input type="file" accept="image/*">`). Decodifica con jsQR
(`public/vendor/jsQR.js`, sin CDN). Al leer: vibración corta, cierra la cámara, llena Folio y Sello y verifica sola.
Errores: "Este código no es de una cotización Kuu Kum" · "No encontré un código Kuu Kum en la imagen" ·
permiso negado → instrucciones (Ajustes → Cotiza → Cámara) y se abre "Ingresar manualmente".
Detener todos los tracks al cancelar, al leer o al salir de la pantalla.

## 3. La app instalada no toma las actualizaciones
- `public/version.json` (`{ "version": "0.3.0" }`) = constante de `app.js` = `CACHE` de `sw.js`; los sincroniza `scripts/bump-version.mjs`.
- Al arrancar, al volver a primer plano y cada 30 min: `registration.update()` y `fetch('/version.json', {cache:'no-store'})`.
  Si difiere → banner fijo "Hay una versión nueva de Cotiza App · Actualizar".
- **Actualizar**: SW en espera → `postMessage('SKIP_WAITING')`, esperar `controllerchange`, `location.reload()`; si no, solo recargar.
- Sin banner durante un envío del Paso 4.
- `_headers`: `Cache-Control: no-cache` para `/`, `/index.html`, `/version.json`, `/sw.js`, `/js/*`, `/styles.css`.
- `sw.js`: responde a `SKIP_WAITING`; red primero; no cachea `/api/*` ni `/version.json`.
- Ajustes muestra la versión y **Buscar actualización**.

## 4. Indicadores de carga en botones
`withLoading(button, asyncFn, textoCargando)`: desactiva (sin doble envío), spinner + texto, restaura al terminar, toast si falla.
Spinner CSS de 18px con `currentColor`; con `prefers-reduced-motion` solo el texto.
Aplica a: Enviar reporte ("Enviando…"; éxito → pantalla con el ID y **Volver a Ajustes**; offline → "Guardado. Se enviará cuando haya internet."),
Guardar ajustes, Verificar, Reintentar subida, Enviar por correo, Actualizar catálogo y clientes, Guardar/Enviar del Paso 4
(en Enviar, el spinner va después de abrir la hoja de compartir).

## 5. Diagnóstico completo en "Reportar un problema"
`public/js/diagnostics.js` → `collectDiagnostics()`, al enviar; resumen colapsado con valores reales.
- **App**: versión (código y `version.json`, marcar si difieren), caché del SW, estado del SW, instalada, ruta, paso y folio del borrador,
  usuario (email, prefijo), fecha local con zona horaria. Commit/rama: los agrega la API (`CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH`).
- **Datos**: cotizaciones total / por subir / con error, últimos 5 `syncError`, último sync exitoso, productos y clientes en caché con fecha,
  `navigator.storage.estimate()`, tamaño de `kk_*` en localStorage, si existe la llave del sello (sí/no).
- **Dispositivo**: userAgent → sistema y navegador; `userAgentData` (modelo, versión) si existe; pantalla, viewport, densidad,
  orientación, idiomas, tema, movimiento reducido, conexión y `navigator.connection`, núcleos, memoria, batería si existe, permiso de cámara.
- **Errores recientes**: `kk_errlog` (máx 30) con `window.onerror`, `unhandledrejection`, errores de `api()` y fallos de PDF/compartir.
- **Servidor** (`/api/reportes`): hora, commit, `request.cf.country`, `request.cf.colo`. Nunca IP ni ubicación precisa.
- **Entrega**: tablas (App, Dispositivo, Sincronización, Errores recientes) en el correo + adjunto `diagnostico-CT-000N.json`.
  El bloque `---ticket---` suma `version`, `commit`, `os`, `navegador`, `instalada`.
- **Nunca se envía**: GPS, contactos, contenido de otras apps, cookies, tokens, la llave del sello, datos de clientes (salvo el folio del borrador).
- iOS no expone el modelo exacto del iPhone; versión de iOS + pantalla + densidad bastan para la familia.

## Criterios de aceptación
- El QR de un PDF nuevo muestra solo texto `KUUKUM|V1|…`, sin enlace.
- Verificar tiene un solo **Escanear QR** que lee el código nuevo y el viejo, llena Folio y Sello y verifica sin teclear.
- **Usar una foto o captura** lee el QR de una captura del PDF.
- "Ingresar manualmente" colapsado por defecto, con los campos y el botón Verificar.
- Tras un deploy con versión nueva, al volver a la app aparece el banner y **Actualizar** carga la nueva versión.
- Ningún botón con petición de red permite doble toque; todos muestran estado de carga.
- El reporte incluye el diagnóstico en el correo y como `diagnostico-CT-000N.json`, sin ubicación, tokens ni la llave del sello.
