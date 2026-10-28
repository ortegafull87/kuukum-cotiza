# Cotiza App · v0.2 — Especificación para Claude Code

Contexto: PWA en Cloudflare Pages + Functions (`public/` = app, `functions/api/` = API, `lib/` = utilidades de servidor).
Odoo 19 en `kuukum.odoo.com` vía API JSON-2 (`lib/odoo.js`). KV `KK` para config, sync, sellos y folios.
Usuarios: 3 correos (Google Sign-In verificado en servidor). UI en español. Diseño: tokens de `public/styles.css`
(Menta fresca/profunda, botones pill, campos underline, objetivos táctiles ≥44px).

## Reglas que no se rompen
- **Sello**: `public/js/canonical.js` se comparte entre app y API. Las cotizaciones existentes usan `kk-v1`;
  no cambies ese formato. Si un cambio necesita otro canónico, crea `kk-v2` y conserva la verificación de `kk-v1`.
- **SEAL_SECRET** nunca cambia. La llave del teléfono es `HMAC(SEAL_SECRET, "seal:"+email)`.
- **iOS share**: `buildPdf()` es síncrono a propósito; `navigator.share` se llama dentro del toque del usuario.
- Cada cambio a archivos de `public/` sube la versión de `CACHE` en `public/sw.js` y la agrega a `SHELL` si es archivo nuevo.
  (Desde la v0.3: usar `node scripts/bump-version.mjs`.)
- La ganancia/costo nunca va en el PDF ni en notas visibles para el cliente.
- Probar con `npx wrangler pages dev public` + un Odoo simulado (`scripts/mock-odoo.mjs`).

---

## 1. Editar cotizaciones (revisiones)

- En Detalle aparece **Editar** (además de Reenviar, Texto, Duplicar). Abre el asistente con una copia; al guardar se crea la
  **revisión N+1**: mismo `uuid`, mismo `folio`, campo `rev` (la original es `rev: 1`).
- Folio visible: `KK-L0012` para rev 1; `KK-L0012-R2`, `-R3`… para revisiones.
- Nuevo sello sobre el contenido nuevo. Canónico `kk-v2` = `kk-v1` + línea `rev:N`. Rev 1 sigue usando `kk-v1`.
- `historial: [{rev, sello, total, fecha}]` con las revisiones anteriores. Estado local: `guardada`, `sync: "pendiente"`, `enviada: false`.
- El PDF muestra `Revisión N` junto al folio cuando `rev > 1`. La lista muestra `KK-L0012 · R2`.

**API `/api/sync`** — si existe `sync:<uuid>` y `quote.rev > rec.rev`:
1. Leer `sale.order.state`. Si es `sale` o `cancel` → 409 "Esta cotización ya es pedido (o está cancelada) en Odoo. Duplícala para hacer una nueva." La app ofrece **Duplicar**.
2. Si es `draft` o `sent`: `write` con `order_line: [[5,0,0], ...]`, `validity_date`, `note`, `source_id`, `client_order_ref: <folio visible>`.
   Si estaba `sent`, `action_draft` antes; se vuelve a marcar enviada al reenviar.
3. `message_post` (nota interna): "Actualizada desde Cotiza App · Rev N · Total antes $X → ahora $Y".
4. Actualizar `sync:<uuid>` con `rev`, y `seal:<FOLIO>` con `{rev, sello, snapshot, historial}`.

**Verificar**: sello de una revisión anterior → "⚠️ Revisión anterior (R1). La vigente es R3" con ambos totales; vigente → "✅ Auténtica".

Fuera de alcance: traer a la app cambios hechos en Odoo (Odoo manda; documentado en Ajustes).

## 2. Reportar un problema

- Ajustes → tarjeta **Ayuda** (antes de la tarjeta con **Cerrar sesión**) → `#/reportar`.
- Formulario: **Pantalla** (combo obligatorio: Inicio de sesión · Paso 1 Cliente · Paso 2 Productos · Paso 3 Condiciones ·
  Paso 4 Verificar · Lista de cotizaciones · Detalle de cotización · PDF · Envío por WhatsApp · Sincronización con Odoo · Ajustes · Otro),
  **Nombre del error** (obligatorio, máx 120), **Descripción** (obligatoria, "¿Qué hacías, qué esperabas y qué pasó?"),
  **Fotos** (hasta 5, comprimidas en el teléfono a 1600 px, JPEG 0.8), **Diagnóstico automático** (colapsado, siempre se envía).
- Offline → se encola y se manda al volver la conexión.

**API `POST /api/reportes`**: ID consecutivo `CT-0001` (`ticket:seq`); KV `ticket:<ID>` sin imágenes; correo vía Odoo
(`ir.attachment.create` por foto, `mail.mail.create` con `email_to = config.reportes_email` (default `hola@kuukum.com`),
`reply_to` = usuario, `auto_delete: false`, y `send`). Asunto `[Cotiza App][CT-0001][<Pantalla>] <Nombre del error>`.
Cuerpo con tabla y bloque parseable:
```
---ticket---
id: CT-0001
pantalla: Paso 2 Productos
usuario: loidaegr@gmail.com
version: v0.2
estado: nuevo
---fin---
```
Respuesta `{id}` → "Reporte CT-0001 enviado. Gracias." Release 2 (no ahora): bandeja de tickets.

## 3. Enviar la cotización por correo desde Odoo (solo clientes cautivos)

Regla (app **y** servidor): el cliente existe en Odoo, tiene email y tiene ≥1 `sale.order` en estado `sale` distinto de la
cotización actual, contando contactos hijos (`partner_id child_of commercial_partner_id`).

- `/api/clientes` agrega `ventas` y `cautivo: ventas >= 1 && email`.
- Paso 4: interruptor "Enviar también por correo a …" (apagado) o línea gris "Correo disponible para clientes con al menos una compra."
- Detalle: **Enviar por correo** con la misma regla; "Enviado por correo el …". Offline se encola; primero sync, luego correo.

**API `POST /api/correo`** `{uuid, pdfBase64}`: 409 si no hay `sync:<uuid>` ("Primero debe subir a Odoo"); revalida la regla (403);
`ir.attachment` con el PDF (`res_model: sale.order`); `message_post` con `partner_ids`, `attachment_ids`, `message_type: "comment"`,
`subtype_xmlid: "mail.mt_comment"`, asunto `Cotización <folio> · Kuu Kum Personalizados`, cuerpo desde `config.correo_cotizacion`
(`{cliente}`, `{folio}`, `{total}`, `{vigencia}`, `{whatsapp}`); `action_quotation_sent`; `correo:<uuid>` en KV (idempotente salvo reenvío explícito).

## Criterios de aceptación
- R1 → R2 actualiza la misma S000xx con nota en el chatter; PDF dice "Revisión 2"; Verificar distingue R1 de R2.
- Editar una cotización que ya es pedido muestra el mensaje, ofrece Duplicar y no modifica Odoo.
- Cotizaciones y sellos existentes (`kk-v1`) siguen verificando.
- Reporte con 3 fotos llega a `hola@kuukum.com` con asunto, fotos y bloque `---ticket---`; offline se envía al reconectar.
- Cliente con ≥1 pedido y email ve la opción de correo; los demás no, y la API rechaza el envío aunque se fuerce.
- El correo llega con el PDF adjunto y queda en el historial de la S000xx.
- `CACHE` actualizado; prueba e2e local con wrangler + Odoo simulado.
