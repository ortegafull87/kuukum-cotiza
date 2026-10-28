# Cotiza App · v0.3.1 — Correcciones de producción

Aplican las "Reglas que no se rompen" de `docs/SPEC-v0.2.md`. (Publicada como versión 0.3.2: la 0.3.1 ya estaba en el commit de la v0.3 §6.)

## 1. Adjuntos de 0 bytes en Odoo (CT-0001…CT-0003)
Odoo 19.3 ya no tiene `ir.attachment.datas`; lo ignora y crea el adjunto vacío. El contenido va en **`raw`** (base64 por RPC).
Todos los adjuntos (fotos y JSON del reporte, PDF del correo) usan `createAttachment()` de `lib/odoo.js`: quita el prefijo
`data:…;base64,`, crea con `raw`, lee `file_size` y exige que coincida con los bytes reales. Si no coincide → error con `requestId`,
se borra el adjunto y no se manda el correo. El mock se comporta como 19.3.

## 2. "Siguiente" desactivado sin explicación (CT-0003)
Arriba de los botones se muestra el motivo ("Falta el precio de «…»", "La cantidad de «…» debe ser mayor a 0", "Elige o crea un cliente").
**+ Producto libre** enfoca y selecciona **Precio unit.** (teclado decimal). La partida en $0 se marca en ámbar.
Precios es-MX: `1,500` → 1500 · `1500.50` → 1500.5 · `150,50` → 150.5; al salir del campo se muestra el valor interpretado.

## 3. Encabezado debajo del reloj y la batería (app instalada)
El margen `--safe-top` va en `.wiz-head`, `.topbar` y el aviso de versión (no en `.screen`).
`apple-mobile-web-app-status-bar-style: black-translucent` con una franja de color detrás de la barra.
Respaldo para apps ya instaladas con `default` (que reportan inset 0 pero se dibujan bajo la barra): `fixSafeArea()` en `app.js`.

## Criterios de aceptación
- Reporte con foto: imagen visible y JSON con contenido; en Odoo `file_size > 0`.
- Con un producto en $0 se ve el motivo; al capturar el precio se activa Siguiente.
- `1,500`, `150,50` y `1500.50` se interpretan bien.
- En la app instalada, título y candado no quedan debajo de la barra de estado.
