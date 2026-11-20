// Precio pieza + técnica (productos con la casilla "Precio pieza + técnica", x_precio_desglose).
// Copia de geek-sync/precios.js: si cambias la suma aquí, cámbiala también allá (la tienda debe dar el mismo total).
// Rangos: [[piezas mínimas, precio c/u], ...] sin IVA, tomados de la lista de precios de Odoo.

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const ordenar = (t) => (t || []).map((x) => [Number(x[0]) || 0, Number(x[1]) || 0]).sort((a, b) => a[0] - b[0]);
// Precio del corte mayor que sea ≤ q (debajo del primero, el primero).
const precioEn = (t, q) => { let p = t[0][1]; for (const [m, v] of t) if (q >= m) p = v; return p; };

// Suma los rangos de la pieza y de la técnica. Empieza en el mayor de los dos mínimos (una técnica puede pedir más
// piezas que la pieza, p. ej. serigrafía desde 20) y los cortes son los de las dos listas arriba de ese mínimo.
// Vacío si falta alguno.
export function sumarTramos(pieza, tecnica) {
  const p = ordenar(pieza), t = ordenar(tecnica);
  if (!p.length || !t.length) return [];
  const min = Math.max(p[0][0], t[0][0]);
  const cortes = [...new Set([min, ...p.map((x) => x[0]), ...t.map((x) => x[0])].filter((m) => m >= min))].sort((a, b) => a - b);
  return cortes.map((q) => [q, r2(precioEn(p, q) + precioEn(t, q))]);
}

// Nombre público de la técnica: la primera línea de su descripción de venta; si no hay, el nombre del
// servicio sin "Personalización · " ni lo que va entre paréntesis.
export function nombreTecnica(nombre, descripcion) {
  const d = String(descripcion || '').split('\n')[0].trim();
  if (d) return d;
  return String(nombre || '').replace(/^Personalizaci[oó]n\s*·\s*/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
}

// Precios por técnica para la tienda: [{ n: nombre público, t: [[mín, total c/u]] }], la más barata primero.
// tecnicas: servicios de Odoo { name, description_sale, list_price, reglas: [[mín, precio]] } (reglas fijas de la
// lista de precios; sin reglas se usa el precio de venta desde 1 pieza). aIva convierte cada total (p. ej. × 1.16).
// Las técnicas sin precio no se ofrecen.
export function armarPrecios(pieza, tecnicas, aIva) {
  return (tecnicas || [])
    .map((s) => {
      return { n: nombreTecnica(s.name, s.description_sale), t: sumarTramos(pieza, reglasTecnica(s.reglas, s.list_price)).map(([m, v]) => [m, aIva(v)]) };
    })
    .filter((x) => x.t.length && x.t.every((r) => r[1] > 0))
    .sort((a, b) => a.t[0][1] - b.t[0][1]);
}

// Rangos de venta de una técnica: sus reglas fijas de la lista de precios. Debajo de la primera regla (o sin reglas)
// Odoo cobra el precio de venta del servicio, así que ese precio va desde 1 pieza.
export function reglasTecnica(reglas, listPrice) {
  const r = ordenar(reglas), lp = Number(listPrice) || 0;
  if (lp > 0 && (!r.length || r[0][0] > 1)) r.unshift([1, lp]);
  return r;
}

// Precio de referencia de la variante en la tienda para productos pieza + técnica: el total con logo del primer rango
// de la técnica más barata. Así nunca se publica la pieza sola (de ahí se deduciría el precio de la técnica).
export function precioReferencia(precios) {
  return precios && precios.length ? precios[0].t[0][1] : null;
}

// Productos con precio pieza + técnica que hay que volver a subir a la tienda porque cambió alguna de sus técnicas
// (el servicio o sus reglas de precio) después de su última escritura en Odoo (que es cuando se subió).
// Fechas de Odoo "AAAA-MM-DD hh:mm:ss" (UTC): se comparan como texto.
export function pendientesPorTecnica(productos, servicios, reglas) {
  const ultimo = new Map();
  const ver = (id, f) => { if (f && (!ultimo.has(id) || f > ultimo.get(id))) ultimo.set(id, f); };
  for (const s of servicios || []) ver(s.id, s.write_date);
  for (const r of reglas || []) ver(Array.isArray(r.product_tmpl_id) ? r.product_tmpl_id[0] : r.product_tmpl_id, r.write_date);
  return (productos || []).filter((p) => (p.x_tecnica_ids || []).some((id) => ultimo.has(id) && ultimo.get(id) > p.write_date)).map((p) => p.id);
}
