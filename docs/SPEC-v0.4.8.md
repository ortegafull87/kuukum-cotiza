# Cotiza App · v0.4.8 — Hotfixes del Paso 2

Hotfix (tercer dígito): **no lleva recorrido**. Archivos: `public/js/app.js`, `public/styles.css`.
Versión con `node scripts/bump-version.mjs patch`.

## 1. El configurador de productos (bottom sheet) no se puede cerrar

Hoy solo cierra tocando el `.backdrop`, pero con `max-height: 92%` casi no queda fondo visible y no hay botón.

- Encabezado del sheet: `¡Okie Dokie!` centrado y a la derecha un botón **✕** (`data-act="closeSheet"`,
  `aria-label="Cerrar"`, 44×44 px, mismo estilo que los botones redondos de la app).
- Deslizar hacia abajo desde `.grab` o el encabezado cierra el sheet si el arrastre pasa de ~80 px (con `touchstart/
  touchmove/touchend` solo sobre `.grab`/`h2`, sin interferir con el scroll de `.body`). El sheet sigue al dedo mientras
  arrastra y regresa si no llega al umbral.
- `max-height: 88%` para que se vea fondo arriba; tocar el fondo sigue cerrando.
- Cerrar no agrega nada ni cambia el borrador; si había texto/chips, se pierden (como hoy al tocar el fondo).

## 2. El nombre del producto libre no parece editable

El nombre ya es un `<textarea class="name" data-f="n">`, pero se ve como título (negritas, sin etiqueta) y trae el texto
"Producto personalizado", así que no se entiende que se puede cambiar.

- Etiqueta visible arriba: **Descripción** (mismo estilo que las etiquetas de `.lrow`), con el textarea debajo como campo:
  borde inferior claro, ícono de lápiz a la derecha y foco con `--accent`. Aplica a todas las líneas.
- Producto libre nuevo (`addFree`): `n: ""` con `placeholder="¿Qué producto es? Ej. Termo 500 ml grabado"`, y el foco va
  a **Descripción** primero (antes iba a Tu costo). `enterkeyhint="next"` en la descripción pasa a Tu costo.
- `stepIssue` ya bloquea Siguiente con descripción vacía ("Escribe la descripción de la partida N"): conservarlo.
- El textarea crece con el texto (1–3 renglones, sin scroll interno).
- Borradores viejos con "Producto personalizado" se quedan igual.

## 3. Los botones de abajo tapan los totales con letra grande

`#step` reserva `176px` fijos, pero con la letra grande de su teléfono la barra `.actions` (aviso + botones) es más alta
y tapa "Tu ganancia".

- Medir la altura real de `#wizact` con `ResizeObserver` y escribirla en `--actions-h` (en `document.documentElement`).
  `#step { padding-bottom: calc(var(--actions-h, 176px) + 16px); }` — el `env(safe-area-inset-bottom)` ya está incluido en
  la altura medida.
- Desconectar el observer al salir del asistente.

## Pruebas de aceptación

1. Agregar producto → ✕ cierra; deslizar hacia abajo cierra; deslizar poco regresa; tocar el fondo cierra. El scroll de la
   lista de chips/resultados no cierra el sheet.
2. Producto libre → foco en Descripción con placeholder; Siguiente desactivado con el aviso hasta escribirla.
3. Líneas de catálogo muestran la etiqueta Descripción y se pueden editar igual.
4. Letra grande del teléfono / zoom 200%: el último renglón de totales queda visible arriba de los botones en los pasos
   2, 3 y 4.
5. `npm run check:version` en verde (0.4.8).
