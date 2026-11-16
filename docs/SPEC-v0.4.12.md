# Cotiza App · v0.4.12 — Canales nuevos y cantidad mínima automática

Hotfix (tercer dígito). Archivos: `public/js/app.js`, `public/styles.css`, `functions/api/sync.js`.

## Canales

Se agregan canales de origen para medir de dónde llegan los clientes: **Google**, **ChatGPT**, **Gemini**, **Claude**
y **Tienda** (clic desde tienda.kuukum.mx). Google, Gemini y Claude llevan su ícono de Simple Icons (CC0, como los de
redes); ChatGPT no está en Simple Icons y va con texto; Tienda lleva una bolsa genérica. La fila se acomoda en dos
renglones. En Odoo quedan como `utm.source` de la cotización: Google, ChatGPT, Gemini, Claude y
"Tienda en línea" (se crean solas la primera vez).

## Cantidad mínima

Para productos con mínimo (primer tramo de la lista de precios, p. ej. Bolígrafo Basic 50):
- Al elegirlo en el configurador, la cantidad arranca en el mínimo.
- Se puede bajar (no se bloquea). Si queda abajo del mínimo, la línea avisa:
  "Este producto está programado para un mínimo de 50 piezas".
