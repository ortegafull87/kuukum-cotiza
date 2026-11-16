# Cotiza App · v0.4.13 — Ficha rápida (i) en la línea

Hotfix. Archivos: `functions/api/imagen.js` (nuevo), `public/js/app.js`, `public/styles.css`.

- Cada línea de catálogo lleva un ícono (i) arriba a la derecha (no en "Arte y preparación" ni en producto libre).
- Abre una ficha con la **imagen principal de Odoo** (`GET /api/imagen?id=<product.product>`, `image_512`, caché
  privada de un día) y, si el producto tiene precio por cantidad, la **tabla de tramos** con precio sin IVA y con IVA,
  resaltando el tramo de la cantidad de la línea y el mínimo programado. Sin tramos muestra el precio de lista.
- Sin internet o sin foto en Odoo: "Sin foto en Odoo o sin internet"; la tabla sí sale (viene del catálogo guardado).
