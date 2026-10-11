# Cotiza App · v0.4.4 — Folios con prefijo AP

(Publicada como 0.4.4: la 0.4.3 ya estaba desplegada con el arreglo de los íconos del PDF.)

- Las cotizaciones nuevas usan `AP-<letra del usuario><consecutivo>`: `AP-L0001`, `AP-V0001`, `AP-K0006`.
  La constante `FOLIO_PREFIX = "AP"` vive en `public/js/canonical.js` (la comparten app y API) junto con `FOLIO_RE`,
  `nuevoFolio()` y `folioNumero()`.
- El consecutivo no se reinicia: es uno por usuario para los dos prefijos. `nextFolio()` toma el más alto entre el contador
  del teléfono, el del servidor (`folio:<email>`) y las cotizaciones locales del usuario (KK- o AP-) y le suma 1:
  después de `KK-K0005` sigue `AP-K0006`. `/api/sync` actualiza `folio:<email>` con `folioNumero()`.
- Revisiones: `AP-K0006-R2`; una cotización vieja conserva su prefijo (`KK-K0005-R2`). El S000xx de Odoo no cambia;
  `client_order_ref` recibe el folio visible.
- Compatibilidad: `FOLIO_RE = /^(KK|AP)-[A-Z]\d{4,}(-R\d+)?$/` (4 o más dígitos, para pasar de la 9999). El lector de QR,
  Verificar manual, `/api/verificar` y las llaves `seal:<FOLIO>` aceptan los dos prefijos. No cambian el canónico del sello
  (`kk-v1`/`kk-v2`) ni el texto `KUUKUM|V1` del QR. Las cotizaciones locales no se renombran. `KK-LIBRE` es el código del
  producto libre en Odoo, no un folio: no cambia.
