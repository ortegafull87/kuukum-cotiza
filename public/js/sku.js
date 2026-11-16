// Desarma un SKU de Kuu Kum en sus partes, para la guía de SKU.
// Formato nuevo (16 nov 2026): K + letra de categoría + modelo de 3 dígitos + letra de color (KP004N; sin color, KP004).
// Formato anterior (aún vigente hasta el renombrado): KU-CAT-MODELO-COL (KU-PLU-1115A-NEG).
// Las letras viven en Odoo y llegan en `tablas` ({ categorias: [{l,n}], colores: [{l,n,hex}] }) desde /api/catalogo.
const NUEVO = /^K([A-HJ-NP-Z])(\d{3})([A-Z0-9])?$/;   // sin I ni O en la categoría
const ANTERIOR = /^KU-([A-Z]{3})-([A-Z0-9]+)(?:-([A-Z0-9]+))?$/;

export function desarmarSku(code, tablas, prod = {}) {
  const c = String(code || "").trim().toUpperCase();
  const t = tablas || {};
  const hay = !!(t.categorias && t.colores);
  const buscar = (lista, l, falta) => (!hay ? { n: "" } : (lista || []).find((x) => x.l === l) || { n: falta });

  let m = c.match(NUEVO);
  if (m) {
    const cat = buscar(t.categorias, m[1], "Categoría no registrada");
    const partes = [
      { txt: "K", que: "marca", nombre: "Kuu Kum" },
      { txt: m[1], que: "categoria", nombre: cat.n },
      { txt: m[2], que: "modelo", nombre: "Modelo " + Number(m[2]) }
    ];
    if (m[3]) {
      const col = buscar(t.colores, m[3], "Color no registrado");
      partes.push({ txt: m[3], que: "color", nombre: col.n, ...(col.hex ? { hex: col.hex } : {}) });
    }
    return { formato: "nuevo", partes };
  }

  m = c.match(ANTERIOR);
  if (m) {
    const partes = [
      { txt: "KU", que: "marca", nombre: "Kuu Kum" },
      { txt: m[1], que: "categoria", nombre: prod.cat || "" },
      { txt: m[2], que: "modelo", nombre: "Modelo del proveedor" }
    ];
    if (m[3]) {
      const col = prod.col || {};
      partes.push({ txt: m[3], que: "color", nombre: col.n || "", ...(col.hex ? { hex: col.hex } : {}) });
    }
    return { formato: "anterior", partes };
  }

  return { formato: "otro", partes: [] };
}
