# Cotiza App · v0.4.11 — Precio por tramos con logo y cargo de Arte y preparación

Hotfix (tercer dígito). Archivos: `functions/api/catalogo.js`, `public/js/calc.js`, `public/js/app.js`.
Versión con `node scripts/bump-version.mjs 0.4.11`.

## Problema

Las plumas se publican y cotizan "con logo, IVA incluido, mínimo N piezas", con precio por tramo de volumen.
Odoo es la fuente de verdad: los tramos viven en la lista de precios "Default" (id 1) como reglas de precio fijo
por producto (`applied_on = 1_product`). Cotiza solo leía `list_price`, así que no aplicaba el tramo.

## Cambio

- `GET /api/catalogo` lee `product.pricelist.item` (lista `config.pricelist_id` o 1, `applied_on = 1_product`,
  `compute_price = fixed`) y manda por producto `t = [[piezas mínimas, precio sin IVA], ...]` y `min` (primer tramo).
  Los productos con tramos **no ofrecen técnicas aparte** (el logo ya va incluido). Todos los productos mandan `code`.
- La línea guarda `t` y `min`. Al cambiar la cantidad, el precio sale del tramo (`precioTramo`) mientras ella no haya
  fijado precio o %. Debajo del precio: "Tramo 50–999 pzs · precio de Odoo con logo", o "Precio manual · volver al tramo".
- Menos piezas que el mínimo: **solo aviso** ("El mínimo es 50 piezas"), no bloquea.
- **Arte y preparación** (servicio Odoo `KU-SRV-ARTE`, $200 sin IVA): al pasar de Productos a Condiciones, si la
  cotización no tiene esa línea, aparece una ventana con el cargo editable. «Agregar cargo» lo agrega con ese precio;
  «No se requiere» lo agrega en $0 (queda registrado que se decidió). Una vez por cotización. La línea de arte puede
  ir en $0 (no marca "Falta el precio").
- El costo de la línea viene de `standard_price` de Odoo, que en las plumas con logo incluye la técnica.

## Datos en Odoo (15 nov 2026)

- Bolígrafo Basic (template 422): `list_price` $9.48; tramos 50+ $9.48 y 1,000+ $6.90 (sin IVA → $11 y $8 con IVA);
  costo $6.97 (pluma Cromografic $1.97 + serigrafía hasta $5).
- Regla de Promocionales en "Default" (item 19): 0 % desde 0 piezas (antes 10 % desde 10), para que no apliquen los
  descuentos globales de 10–25 %.
- Servicio "Arte y preparación" (template 588, `KU-SRV-ARTE`), marcado `x_woo_revision` para no subirse a la tienda.
