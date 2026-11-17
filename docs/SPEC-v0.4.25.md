# Cotiza 0.4.25 — Cotización comparativa y SKU en el PDF

## Para qué
El cliente quiere comparar la misma pieza con distintas cantidades (pluma amarilla con 20, 50 y 100 pzs) en una sola
cotización. Desde 0.4.24 el mismo producto entra en otro renglón; ahora esa cotización puede marcarse como
**comparativa** para que no se sumen los renglones y quede claro que no es para facturar.

## Cómo se activa
- **Sola:** al agregar desde el buscador un producto que ya estaba (mismo `productId` y `ptav`, sin contar el arte), sale
  la ventana «¿Cotización comparativa?» con tres salidas:
  - «Sí, hacerla comparativa» → `draft.comparativa = true`.
  - «No, se suman» → queda normal y no vuelve a preguntar en ese borrador (`draft.compNo = true`).
  - «Fue un error, quitarlo» → quita el renglón que se acaba de agregar.
- **A mano:** interruptor «Cotización comparativa» en el paso 3 (`#comparativa`). Apagarlo también pone `compNo`.
- Editar y Duplicar conservan la marca.

## Qué cambia con la comparativa
- `opcionesComparativa(q)` (calc.js) arma las opciones: renglones sin arte, agrupados por producto en el orden en que se
  agregaron y de menos a más piezas. Cada una lleva `unit` (con el descuento ya aplicado), `importe` sin IVA y `conIva`
  (siempre al 16 %, aunque la cotización vaya sin IVA). Los cargos de arte van aparte: «Cargo único con cualquier opción».
- **PDF:** título «COTIZACIÓN COMPARATIVA»; columnas SKU · Cant. · Descripción · P. unit. s/IVA · Importe s/IVA ·
  Total con IVA; caja con la leyenda (no se suman, no es pedido ni válida para facturación, elige y te mandamos la
  formal). Sin total general, anticipo, saldo ni CLABE. Archivo `Comparativa_<folio>_<cliente>.pdf`.
- **App:** pasos 3 y 4, detalle y lista muestran las opciones en vez de totales; se ocultan «Pago requerido» y
  «Tu ganancia» (la suma no significa nada). La lista dice «Comparativa · N opciones · Sin total».
- **Texto para WhatsApp:** una línea por opción con SKU, importe y total con IVA, y la misma leyenda.
- **Verificar:** muestra que es comparativa y el SKU de cada renglón, sin total.

## Convertir en formal
En el detalle de una comparativa, «Convertir en formal» abre la lista de opciones; Eunice marca la que eligió el cliente
(puede marcar más de una) y se arma la **revisión siguiente del mismo folio** con esas opciones y los cargos de arte,
`comparativa: false`, en el paso 3. Se guarda como cualquier revisión.

## SKU
- Cada renglón guarda `sku` al agregarse (código del catálogo; también el arte). Los renglones viejos lo toman del
  catálogo al generar el sello. Producto libre: «—».
- El PDF normal también trae la columna SKU (primera columna).

## Sello
Solo cambia para comparativas: al final del texto canónico van `comp:1` y `sku:A|B|…`. Las normales firman igual que
antes, así que los sellos emitidos siguen valiendo.

## Odoo
- La comparativa sube como presupuesto con la etiqueta **Comparativa** (`crm.tag`, se crea si no existe; cacheada en KV
  `odoo:tag:comparativa`) y una nota al inicio. Odoo sí suma los renglones en su total; la etiqueta indica que no es venta.
- Al convertir (revisión sin la marca) se quita solo esa etiqueta (`[3, id]`); las demás etiquetas no se tocan.
- El registro de Verificar (`seal:<folio>`) guarda `comparativa` y el `sku` de cada renglón.

## Recorrido
`0.4.25-comparativa` en el paso 3: el interruptor y el bloque de opciones (menciona «Convertir en formal»).

## Pruebas
- Odoo simulado: `crm.tag` y comandos many2many 3/4/6 en `tag_ids`.
