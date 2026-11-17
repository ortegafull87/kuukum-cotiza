# Buscador por SKU en Cotiza (paso 1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Eunice encuentre en el selector "¡Okie Dokie!" un producto escribiendo su SKU (con o sin guiones), el código de un proveedor, el nombre o la categoría, y que los filtros se oculten mientras escribe.

**Architecture:** La API `functions/api/catalogo.js` agrega a cada producto su categoría y sus códigos de proveedor (solo lectura en Odoo). `public/js/catalog.js` arma con eso el texto de búsqueda y una lista de claves normalizadas; `filter()` acepta un producto si coincide por palabras (nombre + categoría) o por clave. La hoja del selector oculta los filtros con texto escrito según una preferencia local del teléfono.

**Tech Stack:** JS (ES modules) sin framework, Cloudflare Pages Functions, Driver.js para recorridos, Node para pruebas.

**Spec:** `docs/superpowers/specs/2026-11-16-sku-cortos-design.md` (orden de trabajo, paso 1; tabla "Kuukum Cotiza").

## Global Constraints
- Odoo solo se lee en este paso: ningún `write`, `create` ni `unlink` nuevo.
- `x_sku_anterior` todavía no existe en Odoo: no se lee en este paso (llega con la migración).
- Los códigos de proveedor nunca salen de Cotiza (no van a la tienda, al PDF ni al WhatsApp del cliente).
- Se conserva sin cambios la lógica de tramos (`t`, `min`) y de técnicas de `catalogo.js`.
- Versión nueva `0.4.20` con `node scripts/bump-version.mjs 0.4.20`; `npm run check:version` debe pasar.
- Toda función nueva lleva su recorrido guiado en `public/js/novedades.js` (id nuevo, nunca reutilizado).
- Textos de la interfaz en español, con el tono actual de la app.
- Nada se publica (`npm run deploy`) sin autorización de Victor.

## Review Focus
- Eunice pega el SKU tal como llega en WhatsApp, con espacios al inicio/fin o en minúsculas (`  ku-plu-1115a-neg `) → debe salir ese producto solo.
- Escribe solo un pedazo del SKU (`1115a`) → salen todas las variantes de ese modelo.
- Un producto con técnica (`<producto> · Láser`, sin `code` propio) → también se encuentra por el SKU de su producto base.
- Texto corto que no es SKU (`az`, `rojo`) → sigue funcionando la búsqueda por nombre como hoy; las claves solo cuentan con 3 o más caracteres.
- Borra todo el texto → regresan los filtros y la selección de chips que tenía.

---

### Task 1: API del catálogo con categoría y códigos de proveedor

**Files:**
- Modify: `functions/api/catalogo.js` (lectura de `product.product` y armado de `out`)
- Modify: `scripts/mock-odoo.mjs` (datos de prueba)
- Test: `scripts/e2e.mjs` (sección nueva de catálogo)

**Interfaces:**
- Produces: cada elemento de `productos` puede traer `cat: string` (último tramo del nombre de la categoría de Odoo, p. ej. `"Promocionales"`) y `prov: Array<{ n: string, code: string }>` (proveedor y su código). Los elementos de técnica (`k` = `"<id>-<ptav>"`) llevan también `code`, `cat` y `prov` de su producto base.

- [ ] **Step 1: Datos de prueba en el Odoo simulado.** En `mock-odoo.mjs`: `categ_id: [15, "Promocionales"]` al producto 11; modelo nuevo `"product.supplierinfo"` con dos filas: `{ id: 1, partner_id: [83, "Geek Promocionales"], product_id: [11, "Gorra"], product_tmpl_id: [11, "Gorra"], product_code: "A090744" }` y `{ id: 2, partner_id: [166, "Cromografic"], product_id: false, product_tmpl_id: [11, "Gorra"], product_code: "1115A" }`. Si el `search_read` del simulado no soporta `in` o `!=` en el dominio, agregarlo en `match`.
- [ ] **Step 2: Prueba que falla** en `e2e.mjs`:
```js
{
  const r = await api("catalogo");
  const g = r.data.productos.find((p) => p.id === 11);
  ok(g && g.cat === "Promocionales", "catálogo: trae la categoría", g);
  ok(g && JSON.stringify(g.prov) === JSON.stringify([{ n: "Geek Promocionales", code: "A090744" }, { n: "Cromografic", code: "1115A" }]),
    "catálogo: trae los códigos de proveedor (de la variante y del producto)", g);
}
```
- [ ] **Step 3: Correr y ver que falla.** `npm run mock-odoo` + `npm run dev` en otra terminal, luego `npm run e2e` → `✗ catálogo: trae la categoría`.
- [ ] **Step 4: Implementar.** Agregar `"categ_id"` a los `fields` de `product.product`. Una llamada `product.supplierinfo` `search_read` con dominio `[["product_tmpl_id","in",tmplIds],["product_code","!=",false]]`, campos `partner_id, product_id, product_tmpl_id, product_code`, `limit: 5000`. Para cada producto, `prov` = filas cuyo `product_id` es esa variante o es `false` con su `product_tmpl_id`, en el orden de `id`, sin códigos repetidos. `cat` = texto después del último `" / "` de `categ_id[1]`; omitir `cat`/`prov` si están vacíos.
- [ ] **Step 5: Correr y ver que pasa.** `npm run e2e` → `✓ catálogo: trae la categoría` y `✓ catálogo: trae los códigos de proveedor…`, sin regresiones.
- [ ] **Step 6: Commit** `git commit -m "Catálogo: categoría y códigos de proveedor (solo lectura)"`

### Task 2: Búsqueda por SKU, código de proveedor, nombre y categoría

**Files:**
- Modify: `public/js/catalog.js` (`enrich`, `filter`)
- Create: `scripts/test-catalog.mjs`
- Modify: `package.json` (script `"test:catalog": "node scripts/test-catalog.mjs"`)

**Interfaces:**
- Consumes: `cat`, `prov`, `code` de Task 1.
- Produces: `export function clave(s: string): string` (mayúsculas, solo `[A-Z0-9]`, sin acentos); `enrich()` agrega `_k: string[]` (claves de `code` y de cada `prov[].code`) y `_q` = nombre + categoría normalizados; `filter(products, sel, text)` mantiene su firma.

- [ ] **Step 1: Prueba que falla** en `scripts/test-catalog.mjs` (mismo estilo `ok()` que `e2e.mjs`, `process.exit(1)` si hay fallas), con un catálogo de 3 productos: `{ id:1, n:"Bolígrafo Basic tinta azul (Negro)", code:"KU-PLU-1115A-NEG", cat:"Promocionales", prov:[{n:"Geek Promocionales",code:"A090744"}] }`, `{ id:2, n:"Bolígrafo Basic tinta azul (Rojo)", code:"KU-PLU-1115A-ROJ" }`, `{ id:3, n:"Playera Gildan. Negro. 100% Algodón", code:undefined }`:
```js
ok(clave(" ku-plu-1115a-neg ") === "KUPLU1115ANEG", "clave: quita guiones, espacios y minúsculas");
ok(ids("  ku-plu-1115a-neg ") === "1", "SKU completo pegado de WhatsApp");
ok(ids("KUPLU1115ANEG") === "1", "SKU sin guiones");
ok(ids("1115a") === "1,2", "pedazo del SKU: todas las variantes del modelo");
ok(ids("A090744") === "1", "código de proveedor");
ok(ids("promocionales") === "1", "categoría");
ok(ids("negro") === "1,3", "nombre como hoy");
ok(ids("az") === "1,2", "texto corto busca por nombre, no por clave");
ok(ids("") === "1,2,3", "sin texto: todos");
```
donde `ids(t) = filter(enrich(cat), {}, t).map(p => p.id).join(",")`.
- [ ] **Step 2: Correr y ver que falla.** `npm run test:catalog` → error `clave is not exported` (o `✗`).
- [ ] **Step 3: Implementar.** `clave` exportada. En `enrich`: `_q = N(p.n + " " + (p.cat || ""))`, `_k = [p.code, ...(p.prov||[]).map(x => x.code)].filter(Boolean).map(clave)`. En `filter`: un producto pasa el texto si todas las palabras están en `_q`, **o** si `clave(text).length >= 3` y alguna `_k` contiene `clave(text)`. Los chips (`sel`) se aplican igual que hoy.
- [ ] **Step 4: Correr y ver que pasa.** `npm run test:catalog` → todos `✓`.
- [ ] **Step 5: Commit** `git commit -m "Buscador: SKU, código de proveedor y categoría"`

### Task 3: Productos con técnica heredan el SKU de su base

**Files:**
- Modify: `functions/api/catalogo.js` (bucle de `tecnicas`)
- Test: `scripts/e2e.mjs`

**Interfaces:**
- Consumes: forma de `out` de Task 1.

- [ ] **Step 1: Prueba que falla** en `e2e.mjs`: en el simulado, dar al producto 11 una técnica con `price_extra > 0` (si no la tiene) y comprobar
```js
const tec = r.data.productos.find((p) => p.id === 11 && p.ptav);
ok(tec && tec.code === "GOR-001" && tec.cat === "Promocionales", "catálogo: la opción con técnica conserva SKU y categoría", tec);
```
- [ ] **Step 2: Correr y ver que falla.** `npm run e2e` → `✗ catálogo: la opción con técnica…`.
- [ ] **Step 3: Implementar.** Al armar cada opción de técnica, copiar `code`, `cat` y `prov` del producto base. Ojo: `ARTE_CODE` y el botón de tienda usan `code`; revisar en `app.js` que `p.code === ARTE_CODE` siga siendo cierto solo para el servicio de arte.
- [ ] **Step 4: Correr y ver que pasa.** `npm run e2e` → `✓`.
- [ ] **Step 5: Commit** `git commit -m "Catálogo: técnicas heredan SKU, categoría y proveedores"`

### Task 4: Filtros que se ocultan al escribir, preferencia en el teléfono y SKU en resultados

**Files:**
- Modify: `public/js/app.js` (`drawSheet` ~610–650, `renderSettings` ~776–810, `ACT`)
- Modify: `public/styles.css` (estilo del SKU bajo el nombre)

**Interfaces:**
- Produces: preferencia local `ls.get("ocultarFiltros", true)` / `ls.set("ocultarFiltros", bool)`; acción `ACT.toggleFiltros`.

- [ ] **Step 1: Implementar en `drawSheet`.** Si `SH.text.trim()` no está vacío y `ls.get("ocultarFiltros", true)` es verdadero, no se pintan los bloques `.facet` (la selección en `SH.sel` se conserva y sigue filtrando). Debajo del nombre de cada resultado, el SKU (`p.code`) en texto pequeño y gris (clase `res-sku`, fuente monoespaciada); si no tiene, nada.
- [ ] **Step 2: Implementar en Ajustes.** Tarjeta nueva "En este teléfono" (fuera de `#cfgform`, no se guarda en el servidor) con un interruptor "Ocultar filtros al escribir en el buscador" y la nota "Solo cambia este teléfono." que llama `ACT.toggleFiltros` y repinta.
- [ ] **Step 3: Probar a mano** con `npm run dev` + simulado, en vista de teléfono: escribir `gor` → desaparecen Prenda/Color/Técnica y se ve `GOR-001` bajo el nombre; borrar → regresan con el chip que estaba marcado; apagar el interruptor → los filtros ya no se ocultan; recargar → la preferencia se conserva.
- [ ] **Step 4: Commit** `git commit -m "Selector: filtros ocultos al escribir (configurable) y SKU visible"`

### Task 5: Recorrido guiado y versión 0.4.20

**Files:**
- Modify: `public/js/novedades.js` (`NOVEDADES`)
- Modify: archivos que toca `scripts/bump-version.mjs`

- [ ] **Step 1: Novedad** al inicio de `NOVEDADES`: `id: "0.4.20-buscador-sku"`, `titulo: "Buscar por SKU"`, `ruta: "#/nueva"`, un paso sobre `el: "button.dashed[data-act=openSheet]"` con el texto: "Ahora puedes pegar en el buscador el SKU que te llega por WhatsApp, el código del proveedor, el nombre o la categoría. Mientras escribes, los filtros se esconden para que veas más resultados; puedes cambiarlo en Ajustes." (Los recorridos no corren con la hoja abierta, por eso apunta al botón que la abre.)
- [ ] **Step 2: Versión.** `node scripts/bump-version.mjs 0.4.20` y `npm run check:version` → `✓ Versión 0.4.20 alineada`.
- [ ] **Step 3: Verificación completa.** `npm run test:catalog` y `npm run e2e` → sin `✗`. Probar a mano en el teléfono simulado que el recorrido sale una vez en "Nueva cotización" y que en Ajustes aparece en la lista de recorridos.
- [ ] **Step 4: Commit** `git commit -m "Cotiza 0.4.20: buscador por SKU y su recorrido"`
- [ ] **Step 5: Pedir autorización a Victor** para `npm run deploy` y, ya publicado, probar con un SKU real (`KU-PLU-1115A-NEG`) y una clave de Geek (`A090744`).
