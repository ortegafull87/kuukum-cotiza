# Cotiza App · v0.4.6 — Margen por producto y tarjeta de línea en una columna

## Por qué

- Eunice quiere poner el **porcentaje de ganancia** de cada producto y que el precio salga solo, o escribir el precio y ver
  el porcentaje. Hoy solo ve "Ganas $X" por línea y el % de toda la cotización abajo.
- Su teléfono tiene la letra más grande y la fila "cantidad · precio · costo" se aprieta: el precio sale cortado ("27.53").
- Decisión: el porcentaje es **margen sobre la venta** = (precio − costo) ÷ precio × 100, el mismo criterio del badge de
  totales (`calc().margen`). Lo que ella escriba en la línea es lo mismo que verá abajo.

## Alcance

Solo el **Paso 2** (tarjeta `.line`), para **todas** las líneas: de catálogo y libres. No cambian el paso 4, el detalle,
el PDF, `/api/sync` ni el canónico.

Archivos: `public/js/calc.js`, `public/js/app.js`, `public/styles.css`. Versión con `scripts/bump-version.mjs`.

## 1. Cálculo (`public/js/calc.js`)

Agregar y exportar:

```js
export const MARGEN_MAX = 95;
// Margen de una línea en %, o null si no hay precio. Puede ser negativo (vender bajo costo).
export function margenLinea(p, c) { p = Number(p) || 0; c = Number(c) || 0; return p > 0 ? ((p - c) / p) * 100 : null; }
// Precio unitario para un margen dado, redondeado a centavos. null si no se puede (sin costo o margen fuera de rango).
export function precioDesdeMargen(c, m) {
  c = Number(c) || 0; m = Number(m);
  if (!(c > 0) || !Number.isFinite(m) || m < 0 || m > MARGEN_MAX) return null;
  return r2(c / (1 - m / 100));
}
```

`calc()` no cambia.

## 2. Datos de la línea

Dos campos opcionales en cada item del borrador (viven solo en el teléfono; `/api/sync` ya arma las líneas con campos
explícitos y no los manda; el canónico solo usa `q|p|n`):

- `m`: el último margen que ella **escribió** (número, sin redondear a la vista).
- `fijo`: `"m"` o `"p"`, cuál de los dos tocó al último. Ausente = `"p"` (cotizaciones y borradores viejos).

## 3. Reglas de edición (handler `input` de `.line`)

| Ella edita | Qué pasa |
|---|---|
| **Precio** (`data-f="p"`) | `it.p = parseMoney`, `it.fijo = "p"`, se borra `it.m`. El campo % muestra `margenLinea(p, c)`. |
| **Ganancia %** (`data-f="m"`) | `it.m = parseMoney` (acepta "28,5", "28.5", "28.5%"), `it.fijo = "m"`. Si `precioDesdeMargen(c, m)` da número, `it.p` = ese número y se escribe en el campo precio. |
| **Costo** (`data-f="c"`) | `it.c = parseMoney`. Si `fijo === "m"` y hay precio calculable → recalcular `it.p`. Si no → el precio se queda y se recalcula el %. |
| **Cantidad** | Sin cambio en precio ni %. |

- Mientras ella escribe en un campo, **nunca** se reescribe ese mismo campo (solo el otro). Al salir (`change`) se muestra
  el valor interpretado, como ya se hace con p/c/q.
- Margen > 95: no se calcula precio; el campo % se marca en rojo y aparece debajo "El margen máximo es 95%". Margen < 0
  tecleado: igual, mensaje "El margen no puede ser negativo".
- Costo 0 y ella escribe %: no se calcula precio; mensaje "Pon tu costo para calcular el precio".
- Sin precio: el campo % se ve vacío con placeholder `—`.
- Mostrar el %: si `fijo === "m"` se muestra `it.m` tal cual; si no, `margenLinea(p, c)` con **1 decimal** (`28.6`).
  Un margen calculado negativo se muestra con signo (`-4.2`) en rojo.
- El campo % lleva los colores del badge: reutilizar los umbrales de `marginBadge` (≥45 ok, ≥30 warn, <30 bad) en una
  función común `marginClass(m)` y aplicarla como color del texto/borde del campo.
- `updateLine(k)` actualiza también el campo que no tiene el foco (precio o %) y el mensaje de validación.
- `addFree`: al crear el producto libre, enfocar **Tu costo** (es lo primero que ella sabe) en lugar del precio.

## 4. Tarjeta en una columna (`lineCard` + CSS)

Una fila por dato, etiqueta a la izquierda y valor a la derecha, a todo lo ancho, en este orden:

```
Estampado en Serigrafía. 1 Tinta          (descripción, editable, puede ocupar 2 líneas)
─────────────────────────────────
Cantidad              [ − ]  50  [ + ]
Tu costo                     $19.67
Ganancia                     28.6 %
Precio unit.                 $27.53
─────────────────────────────────
Ganas $393.00          Total $1,376.50
Quitar
```

- Estructura sugerida: cada fila `<label class="lrow"><span>Etiqueta</span><input …></label>` (el stepper en su propia
  fila `.lrow`). `.lrow { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:var(--tap) }`.
- Inputs numéricos: alineados a la derecha, fuente `--mono`, ancho flexible (`flex: 0 1 9em; min-width: 6em`), sin cortar
  el contenido. El `$` y el `%` van como texto junto al input (no dentro del valor).
- `inputmode="decimal"` en costo, % y precio. `enterkeyhint="next"`.
- Pie: "Ganas" y "Total" en una fila con `flex-wrap: wrap` (si no caben, bajan sin encimarse); "Quitar" en su propia fila
  a la izquierda.
- Se quita `.line .row` (grid de 3 columnas). Se conserva `.line.warn` (sin precio): el borde de alerta ahora en el campo
  precio de la fila.
- La descripción puede envolver en dos líneas (`textarea` de 1–2 filas autoajustable o input con `white-space` normal);
  no debe cortarse a una línea con elipsis.

## 5. Pruebas de aceptación

Con `npx wrangler pages dev public` + `scripts/mock-odoo.mjs`:

1. Costo 19.67, escribir 40 en Ganancia → precio **32.78**; el % sigue mostrando 40; badge de totales coherente (40%).
2. Escribir precio 27.53 con costo 19.67 → Ganancia **28.6** en rojo; totales 29% rojo (como hoy).
3. Con 40% fijo, cambiar costo a 20 → precio **33.33**. Con precio 27.53 fijo, cambiar costo a 20 → Ganancia **27.4**.
4. Escribir 96 → no cambia el precio y aparece el aviso de 95%. Escribir % con costo 0 → aviso de costo.
5. Producto libre nuevo → el foco cae en Tu costo.
6. Borrador viejo (items sin `m`/`fijo`) abre igual que antes y el % se calcula del precio.
7. Ancho 320 px y zoom de texto del navegador al 150–200%: ningún valor cortado, nada encimado, todo legible.
8. PDF y nota de Odoo sin % ni costo (regla 4). Verificar sello de una cotización nueva y de una vieja (canónico intacto).
9. `node scripts/bump-version.mjs 0.4.6` y `npm run check:version` en verde.

## Reglas que aplican

Ganancia y costo nunca en el PDF ni en notas para el cliente · canónico `kk-v1`/`kk-v2` sin cambios · versión solo con
`bump-version.mjs` · no borrar `localStorage`/IndexedDB.
