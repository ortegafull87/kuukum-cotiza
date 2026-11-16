// Códigos de proveedor por producto (filas de product.supplierinfo de Odoo).
// Una fila con variante (product_id) aplica solo a esa variante; sin variante, a todo el producto (product_tmpl_id).
const m2oId = (v) => (Array.isArray(v) ? v[0] : v) || null;

// Regresa provDe(fila de product.product) -> [{ n: proveedor, code }], en el orden de id y sin códigos repetidos.
export function indexarProveedores(filas) {
  // Índice por producto (template): cada variante solo recorre las filas de su producto, no todo el catálogo.
  const porTmpl = new Map();
  for (const s of [...filas].sort((a, b) => a.id - b.id)) {
    const tid = m2oId(s.product_tmpl_id);
    if (!porTmpl.has(tid)) porTmpl.set(tid, []);
    porTmpl.get(tid).push(s);
  }
  return (r) => {
    const vistos = new Set(), lista = [];
    for (const s of porTmpl.get(m2oId(r.product_tmpl_id)) || []) {
      const vid = m2oId(s.product_id);
      if (vid && vid !== r.id) continue;
      const code = String(s.product_code).trim();
      if (!code || vistos.has(code)) continue;
      vistos.add(code);
      lista.push({ n: Array.isArray(s.partner_id) ? String(s.partner_id[1]) : "", code });
    }
    return lista;
  };
}
