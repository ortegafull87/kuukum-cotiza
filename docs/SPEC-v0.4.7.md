# Cotiza App · v0.4.7 — Recorridos guiados de novedades

## Por qué

Cada cambio visible debe explicarse solo, en la pantalla donde ocurre, sin que Victor tenga que explicarlo en persona.
Un recorrido corto (1–3 burbujas) la primera vez que ella llega a esa pantalla; si ya lo vio o lo saltó, no vuelve a salir.

## 1. Librería: Driver.js (MIT, sin dependencias, sin build)

- `npm i -D driver.js` y copiar a `public/vendor/`:
  - `node_modules/driver.js/dist/driver.js.iife.js` → `public/vendor/driver.js`
  - `node_modules/driver.js/dist/driver.css` → `public/vendor/driver.css`
  Anotar en el encabezado de cada archivo la versión copiada. Nada desde CDN: tiene que funcionar sin internet.
- `index.html`: `<link rel="stylesheet" href="/vendor/driver.css?v=X">` y `<script src="/vendor/driver.js?v=X"></script>`
  antes de `app.js` (expone `window.driver.js.driver`). Los `?v=` los mantiene `bump-version.mjs`.
- `sw.js`: agregar `"/vendor/driver.css" + V` y `"driver"` a la lista de vendor del `SHELL`, y `"novedades"` a la lista de
  módulos.
- Si `window.driver` no existe (falló la carga), los recorridos simplemente no aparecen; la app no se rompe.

## 2. Catálogo de novedades: `public/js/novedades.js`

```js
// Una entrada por cambio visible. El id nunca se reutiliza ni se cambia (es lo que se guarda como "visto").
// Se conservan las de las últimas ~3 versiones; las más viejas se borran del archivo.
export const NOVEDADES = [
  {
    id: "0.4.6-margen",
    titulo: "Ganancia por producto",          // se lista en Ajustes
    ruta: "#/nueva",                           // prefijo de location.hash donde aplica
    pasos: [
      { el: '.line [data-f="c"]', titulo: "Tu costo",
        texto: "Empieza aquí: escribe lo que te cuesta a ti." },
      { el: '.line [data-f="m"]', titulo: "Ganancia %",
        texto: "Escribe cuánto quieres ganar y el precio se calcula solo. Es el % sobre la venta, el mismo de “Tu ganancia” abajo. Verde 45% o más, amarillo 30–44%, rojo menos de 30%." },
      { el: '.line [data-f="p"]', titulo: "Precio unitario",
        texto: "¿Prefieres poner el precio? Escríbelo y el % se ajusta. Si cambias el costo, se respeta lo último que escribiste." }
    ]
  }
];
```

Textos: tú, frases cortas, sin tecnicismos, máximo ~25 palabras por paso.

## 3. Motor (en `app.js` o en `novedades.js` exportando `maybeTour()` y `startTour(id, {forzar})`)

- Vistos: `ls.get("tours", [])` (arreglo de ids, en `localStorage` como `kk_tours`). Se agrega el id al **terminar** o al
  **cerrar/saltar**. Nunca se borra esa llave al reparar ni actualizar (regla 8).
- `maybeTour()` se llama al final de `render()` y de `renderWizard()` con `setTimeout(…, 400)` (deja terminar animaciones
  y el foco automático). Muestra la **primera** novedad no vista cuya `ruta` coincide y cuyo **primer** `el` existe y es
  visible. Si no existe aún (p. ej. Paso 2 sin productos), no hace nada; se vuelve a intentar en el siguiente render
  (al agregar el producto).
- No arranca si: ya hay un recorrido activo, `S.sending`, el escáner o una hoja/sheet está abierta, hay un loader, o el
  documento no está visible. Un recorrido por pantalla: si hay otro pendiente, sale en el siguiente render.
- Al iniciar, `document.activeElement.blur()` para cerrar el teclado (la burbuja no debe quedar tapada).
- Pasos cuyo `el` no existe en ese momento: se muestran como burbuja centrada sin resaltar (Driver.js lo permite sin
  `element`).
- Configuración de Driver.js: `showProgress: true` ("1 de 3"), `progressText: "{{current}} de {{total}}"`,
  `nextBtnText: "Siguiente"`, `prevBtnText: "Atrás"`, `doneBtnText: "Entendido"`, `allowClose: true`,
  `overlayClickBehavior: "close"`, `smoothScroll: true`, `stagePadding: 6`. Marcar como visto en `onDestroyed`.
- Errores dentro del recorrido: `try/catch` → `logError` y se marca como visto (no insistir con uno roto).

## 4. Estilo

En `styles.css`, sobrescribir `.driver-popover` con los tokens de la app (fondo `--surface`, texto `--fg`, borde
`--line`, radio `--r`, fuente `--font`), modo oscuro incluido. Tamaños en `em`/`rem` que respeten la letra grande del
teléfono. Botones con alto mínimo `var(--tap)`; "Siguiente"/"Entendido" en `--accent`, "Atrás" neutro; la ✕ de cerrar
visible y de 44 px. La burbuja nunca más ancha que la pantalla menos 32 px.

## 5. Ajustes: card "Novedades"

Antes de la card de Seguridad (que sigue al final), una card **Novedades** con la lista de `NOVEDADES` (título + "Ver").
"Ver" navega a `ruta` y llama `startTour(id, { forzar: true })` (ignora vistos y no exige que exista el elemento:
los pasos sin elemento salen centrados). No cambia la marca de visto.

## 6. Diagnóstico

`diagnostics.js` agrega `toursVistos` (solo los ids) al diagnóstico de "Reportar un problema".

## 7. Pruebas de aceptación

1. Teléfono limpio → Nueva → Paso 2 sin productos: no sale nada. Agregar producto libre → sale el recorrido (3 pasos,
   "1 de 3"), con el teclado cerrado.
2. "Entendido" o ✕ → no vuelve a salir (recargar, cerrar la app, actualizar versión).
3. Ajustes → Novedades → Ver → se repite aunque no haya productos (burbujas centradas).
4. Sin internet (modo avión, app ya instalada) → el recorrido funciona.
5. Letra grande del teléfono / zoom 200% / 320 px: burbuja legible, botones tocables, nada cortado. Modo oscuro correcto.
6. Durante el envío del Paso 4 no aparece ningún recorrido.
7. Quitar `driver.js` de la red (DevTools → bloquear) → la app funciona igual, sin recorrido.
8. `node scripts/bump-version.mjs patch` → 0.4.7 y `npm run check:version` en verde (incluye los `?v=` nuevos).

## 8. Proceso desde esta versión

Todo spec con un cambio visible lleva una sección **"Recorrido"**: id (`<versión>-<tema>`), ruta, y 1–3 pasos
(selector + título + texto). Claude Code la agrega a `NOVEDADES` como parte del mismo cambio. Cambios sin efecto visible
(arreglos internos) no llevan recorrido.

## Recorrido

Este spec no agrega una novedad propia: el primer recorrido es el de 0.4.6 (sección 2).
