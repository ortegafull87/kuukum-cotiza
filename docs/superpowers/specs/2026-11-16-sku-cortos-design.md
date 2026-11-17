# SKU cortos, guía de SKU, buscador de Cotiza y SKU de proveedor — diseño (16 nov 2026)

## Por qué
El cliente ve un producto en la tienda y toca el botón de WhatsApp, que le manda a Eunice el SKU (`KU-PLU-1115A-NEG`).
Eunice lo busca en Kuukum Cotiza y no lo encuentra: el código es largo y el buscador de Cotiza no busca por SKU.
Además, Eunice no sabe qué significa cada parte del código, y para pedir cotización a un proveedor (p. ej. Cromografic) necesita el código de ese proveedor.
Meta: que encuentre el producto al primer intento, entienda el código de un vistazo y tenga a la mano el código del proveedor, sin tiempo extra para Victor ni para Eunice.

## Metas / no-metas / anti-metas
- Metas:
  - SKU de ≤ 6 caracteres alfanuméricos, idéntico en Odoo y la tienda.
  - Guía visual del SKU dentro de Cotiza.
  - Cotiza busca por SKU (nuevo y anterior), código de proveedor, nombre y categoría.
- No-metas (por ahora):
  - Productos propios (playeras, sudaderas, tazas…: tienen talla y 56 colores).
  - Folios de Cotiza (AP-/KK-).
  - `KK-LIBRE`, `GAS`, `INS` y gastos.
  - Generar el pedido al proveedor: es el siguiente feature (ver al final).
- Anti-metas:
  - Perder la sincronización de stock de Geek/USB.
  - Dejar SKU duplicados o huérfanos en la tienda.
  - Que un SKU viejo deje de encontrarse.
  - Que la tienda muestre códigos de proveedor.

## Formato del SKU
`K` + categoría (1 letra) + modelo (3 dígitos, con ceros) + color (1 carácter). Ej.: `KP004N`.
- Producto sin color, y producto padre en la tienda: 5 caracteres (`KP004`).
- No se usan I ni O (se confunden con 1 y 0).
- Los colores que no alcanzan letra usan un dígito (Rosa gold 2, Transparente 3).
- La letra de categoría y la de color viven en Odoo (fuente de verdad). El número de modelo lo calcula el Worker: el siguiente libre en la categoría.
- Propuesta inicial de equivalencias: `SKU_cortos_propuesta.xlsx` (474 variantes).

## Opciones de migración consideradas
- **A. Cambio en una sola ventana (elegida).** Campos de respaldo → código listo para el formato nuevo → renombrado en una ventana programada. Ya funcionó con KK→KU.
- B. Por categoría: los dos formatos conviven semanas y hay más código. Descartada.
- C. SKU corto en un campo aparte: no cumple con "el mismo en ambos". Descartada.

## Antes → después por sistema

### Odoo (fuente de verdad)
| Tema | Antes | Después |
|---|---|---|
| Categorías | Una sola, Promocionales (id 15, 175 productos) | Categorías de primer nivel (Plumas, Agendas, Tecnología, Termos, Gorras, Sets corporativos…), cada una con el campo nuevo **Letra SKU**. Promocionales desaparece |
| Colores | Atributo COLOR tipo Radio; `html_color` vacío | Tipo **Color** (circulito) y campo nuevo **Letra SKU** en cada valor |
| Modelo del proveedor | Solo dentro del SKU | Campo nuevo `x_modelo_proveedor` en `product.template` |
| SKU anterior | Se perdería | Campo nuevo `x_sku_anterior` en `product.product` (búsqueda y reversa) |
| SKU de proveedor | Pestaña Compra → Proveedores; Geek y USB ya tienen código por variante (444); Cromografic (id 166) sin productos | Se cargan los renglones de Cromografic con el **modelo de Doble Vela** como código, por ahora; después, los códigos de su micrositio |
| Búsqueda de Productos | Solo SKU exacto con guiones | También `x_sku_anterior` y código de proveedor (vista heredada) |
| Lista de precios | Regla 0 % sobre Promocionales | Se borra |

### Worker geek-sync
| Tarea | Antes | Después |
|---|---|---|
| Stock y fichas de Geek | Modelo sacado del SKU por guiones | Lee `x_modelo_proveedor` |
| Importar productos de USB | `KU-TEC-…-COL` en Promocionales | `KT` + siguiente número + letra de color (leída de Odoo), en Tecnología. Si el color no tiene letra, no lo importa y lo reporta en `x_usb_resultado` |
| SKU padre en la tienda | Primeros 3 segmentos | SKU de la variante sin la última letra |
| Categoría en la tienda | Sacada del SKU | Nombre de la categoría en Odoo |
| Encontrar el producto en la tienda | SKU con truco KK-→KU- | SKU nuevo y, si no está, `x_sku_anterior`; lo renombra |
| Migración | — | Ventana `MIGRAR_SKU_DESDE`: renombra los 474 SKU con `load` |

### WooCommerce
| Tema | Antes | Después |
|---|---|---|
| SKU visible y en WhatsApp | `KU-PLU-1115A-NEG` | `KP004N` (lo actualiza el Worker) |
| Categorías | Del SKU | Iguales a Odoo, una a una |
| Solo cotizar (`_cwe_promocional`) | El Worker lo pone a todo lo que sube | Igual |
| Código de proveedor | No | No (solo Odoo/Cotiza) |

### Kuukum Cotiza
| Tema | Antes | Después |
|---|---|---|
| Buscador | Solo nombre (`_q` = nombre; el `[código]` se descarta) | SKU nuevo y anterior, código de proveedor (sin importar guiones ni mayúsculas), nombre y categoría. Con un código exacto queda un solo resultado, ya elegido |
| Filtros (Prenda, Color, Técnica) | Siempre visibles | Se ocultan al escribir; interruptor en Ajustes, encendido por defecto, guardado en el teléfono |
| SKU en pantalla | En ningún lado | En resultados y en la Ficha (i), tocable |
| Guía de SKU | No existe | Al tocar un SKU: el código desarmado en cajitas (K · P · 004 · N) con categoría y circulito de color, y abajo las tablas completas (leídas de Odoo). También desde Ajustes → Guía de SKU |
| Proveedores en la Ficha | No | Sección "Proveedores": proveedor + código (+ color), para copiarlo al pedir cotización |
| Catálogo (`functions/api/catalogo.js`) | id, nombre, código, precios | Además: categoría, `x_sku_anterior`, proveedores con código y tablas de letras (solo lectura) |
| Botón "ver en la tienda" | Padre = 3 segmentos | Padre = primeros 5 caracteres |
| Servicio de arte | `KU-SRV-ARTE` escrito a mano | Su SKU nuevo |
| Recorrido guiado | — | Uno nuevo para buscador, guía y proveedores |

## Orden de trabajo (cada paso con autorización de Victor)
1. Cotiza: buscador (SKU actual, código de proveedor, nombre, categoría) y filtros ocultables. Sirve desde hoy con los SKU largos.
2. Odoo: campos Letra SKU, COLOR tipo Color, categorías planas, `x_modelo_proveedor`, `x_sku_anterior`, búsqueda ampliada, borrar regla 0 %.
3. Odoo: renglones de Cromografic con el modelo de Doble Vela.
4. Revisión de Eunice: letras en Odoo y color de TEC179 (USB `TEC179-BL` está ligado a la variante Negro).
5. Cotiza: guía de SKU y sección Proveedores en la Ficha.
6. Worker y Cotiza listos para el formato nuevo → ventana de renombrado.
7. Revisión en la tienda; actualizar `Contexto.md` con las reglas nuevas.

## Reversa
`x_sku_anterior` permite regresar todos los SKU con una sola carga; el Worker renombra la tienda de la misma forma.

## Decisiones de Claude (revisar)
- Lápices y crayones comparten la `L`; Termos = `R`; Servicios = `V`.
- Numeración dentro de cada categoría en el orden del código actual del proveedor.
- Interruptor de filtros guardado en el teléfono, no en la configuración compartida.
- Código de Cromografic = modelo de Doble Vela en `product_code`, ligado a la variante (el color sale de la variante).

## Siguiente feature (apuntado, no entra aquí)
Botón en Cotiza, después de guardar la cotización: **"Generar pedido a proveedor"**, para pedir cotización al proveedor con sus códigos al mismo tiempo que Kuu Kum cotiza.
