// Precio pieza + técnica (productos con la casilla "Precio pieza + técnica", x_precio_desglose).
// Copia de geek-sync/precios.js: si cambias la suma aquí, cámbiala también allá (la tienda debe dar el mismo total).
// Rangos: [[piezas mínimas, precio c/u], ...] sin IVA, tomados de la lista de precios de Odoo.

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const ordenar = (t) => (t || []).map((x) => [Number(x[0]) || 0, Number(x[1]) || 0]).sort((a, b) => a[0] - b[0]);
// Precio del corte mayor que sea ≤ q (debajo del primero, el primero).
const precioEn = (t, q) => { let p = t[0][1]; for (const [m, v] of t) if (q >= m) p = v; return p; };

// Suma los rangos de la pieza y de la técnica. Los cortes son los de la pieza más los de la técnica que
// quedan arriba del mínimo de la pieza (nunca un corte debajo del mínimo). Vacío si falta alguno.
export function sumarTramos(pieza, tecnica) {
  const p = ordenar(pieza), t = ordenar(tecnica);
  if (!p.length || !t.length) return [];
  const min = p[0][0];
  const cortes = [...new Set([...p.map((x) => x[0]), ...t.map((x) => x[0]).filter((m) => m > min)])].sort((a, b) => a - b);
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
      const reglas = (s.reglas || []).length ? s.reglas : Number(s.list_price) > 0 ? [[1, Number(s.list_price)]] : [];
      return { n: nombreTecnica(s.name, s.description_sale), t: sumarTramos(pieza, reglas).map(([m, v]) => [m, aIva(v)]) };
    })
    .filter((x) => x.t.length && x.t.every((r) => r[1] > 0))
    .sort((a, b) => a.t[0][1] - b.t[0][1]);
}
