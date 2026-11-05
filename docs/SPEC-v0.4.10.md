# Cotiza App · v0.4.10 — Técnicas de personalización con precio (Láser en plumas)

Hotfix (tercer dígito): **no lleva recorrido**. Archivos: `functions/api/catalogo.js`, `functions/api/sync.js`,
`public/js/catalog.js`, `public/js/app.js`. Versión con `node scripts/bump-version.mjs 0.4.10` (se salta 0.4.9, que usa
la rama `hotfix/new-chanel` sin publicar).

## Problema

En Odoo, la técnica de los promocionales de Geek (Láser, Serigrafía, Tampografía…) es un atributo **"no crea
variantes"** (TÉCNICA). Cotiza solo leía `product.product` y sacaba los chips del nombre, así que el Bolígrafo Premier no
mostraba "Láser" y se cotizaba sin cobrar el grabado (costo real $10 por pieza).

## Cambio

- `GET /api/catalogo` lee también `product.template.attribute.value` de esos productos con
  `attribute_id.create_variant = no_variant`, `ptav_active` y **`price_extra > 0`**.
- Por cada técnica con extra agrega una opción más: `k = "<id>-<ptav>"`, `ptav`, nombre `"<producto> · <técnica>"`,
  `p = precio + extra`, `c = costo + extra / 1.25`. La regla de Kuu Kum es **costo de la técnica + 25 %**
  (`MARKUP_PERSONALIZACION`); en Odoo el extra guarda el precio, el costo se deduce de él.
- Las técnicas con extra en $0 **no se ofrecen** (no tienen costo conocido; cotizarlas sería regalar la personalización).
  Cuando se les ponga extra en Odoo aparecen solas.
- Los productos sin técnica salen igual que antes (con `k = "<id>"`).
- Configurador: la selección usa `k` en lugar de `id` (un producto puede venir varias veces). La línea guarda `ptav`.
- Sync: si la línea trae `ptav`, se manda `product_no_variant_attribute_value_ids: [[6, 0, [ptav]]]` para que la técnica
  quede registrada en la línea de la orden de Odoo.

## Datos en Odoo (4 nov 2026)

Extra **+$12.50** (=$10 + 25 %) en la técnica Láser de 12 plumas sueltas: Premier, Premier Touch, Majestic, Láser,
Greca, Teacher, Verdi, Munich, Portugal, Montenegro, Palm y Bungalo. Ej.: Premier (Azul) · Láser = $13.46 + $12.50 =
**$25.96** sin IVA, costo $22.24.
