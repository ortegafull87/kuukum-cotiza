# Cotiza 0.4.24 — Hotfix: el mismo producto puede ir en varios renglones

- **Antes:** al agregar desde el buscador un producto que ya estaba en la cotización (mismo `productId` y misma
  técnica `ptav`), las piezas se sumaban al renglón existente.
- **Ahora:** siempre se agrega un renglón nuevo. Sirve para cotizar la misma pluma con 20, 50 y 100 piezas y que el
  cliente compare en una sola cotización. Cada renglón toma el precio del tramo de su cantidad (`aplicaTramo`).
- Si el producto ya estaba, el aviso dice "Agregado en otro renglón: …" (3 s) para que no parezca un error.
- Nada cambia en el servidor: `sync.js` ya manda a Odoo una `sale.order.line` por renglón, y el PDF y el sello
  trabajan por renglón.
- **Ojo:** el total de la cotización suma todos los renglones (20 + 50 + 100). Si el cliente solo compara opciones,
  el total no representa lo que va a pagar.
- Recorrido: `0.4.24-mismo-producto` en `public/js/novedades.js`, apunta al botón que abre el buscador.
