import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";
import { indexarProveedores } from "../../lib/proveedores.js";

// Regla de Kuu Kum para personalizaciones (técnicas como Láser): precio = costo de la técnica + 25 %.
// En Odoo el extra de la técnica guarda el PRECIO; el costo se saca de aquí para que el margen salga bien.
export const MARKUP_PERSONALIZACION = 0.25;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const m2oId = (v) => (Array.isArray(v) ? v[0] : v) || null;

// Productos vendibles de Odoo, sin gastos internos ni precios capturados mal.
// Además, por cada técnica de personalización con precio (atributo "no crea variantes" con extra > 0, p. ej. Láser
// en las plumas) se agrega una opción "<producto> · <técnica>" con el precio y el costo de la técnica sumados.
// Las técnicas con extra en 0 no se ofrecen: así no se cotiza una personalización sin cobrarla.
export async function onRequestGet({ env, data }) {
  try {
    const call = odoo(env, data.log);
    const rows = await call("product.product", "search_read", {
      domain: [["sale_ok", "=", true], ["active", "=", true]],
      fields: ["id", "display_name", "default_code", "list_price", "standard_price", "taxes_id", "product_tmpl_id", "categ_id"],
      limit: 2000
    });
    const skip = new Set(String(data.config.excluir_codigos || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
    const tmplIds = [...new Set(rows.map((r) => m2oId(r.product_tmpl_id)).filter(Boolean))];
    const tecnicas = new Map();   // template -> [{ ptav, n, extra }]
    if (tmplIds.length) {
      const ptavs = await call("product.template.attribute.value", "search_read", {
        domain: [["product_tmpl_id", "in", tmplIds], ["attribute_id.create_variant", "=", "no_variant"],
          ["ptav_active", "=", true], ["price_extra", ">", 0]],
        fields: ["id", "name", "product_tmpl_id", "price_extra"],
        limit: 5000
      });
      for (const t of ptavs) {
        const tid = m2oId(t.product_tmpl_id);
        if (!tecnicas.has(tid)) tecnicas.set(tid, []);
        tecnicas.get(tid).push({ ptav: t.id, n: String(t.name).trim(), extra: Number(t.price_extra) || 0 });
      }
    }
    // Tramos por volumen (lista de precios de Odoo, regla fija por producto): el precio ya incluye el logo.
    // Si un producto tiene tramos, su precio depende de las piezas y no se ofrecen técnicas aparte.
    const tramos = new Map();   // template -> [[piezas mínimas, precio sin IVA], ...] de menor a mayor
    if (tmplIds.length) {
      const items = await call("product.pricelist.item", "search_read", {
        domain: [["pricelist_id", "=", Number(data.config.pricelist_id) || 1], ["applied_on", "=", "1_product"],
          ["compute_price", "=", "fixed"], ["product_tmpl_id", "in", tmplIds]],
        fields: ["product_tmpl_id", "min_quantity", "fixed_price"],
        limit: 5000
      });
      for (const it of items) {
        const tid = m2oId(it.product_tmpl_id);
        if (!tramos.has(tid)) tramos.set(tid, []);
        tramos.get(tid).push([Number(it.min_quantity) || 0, r2(it.fixed_price)]);
      }
      for (const t of tramos.values()) t.sort((a, b) => a[0] - b[0]);
    }
    // Códigos de proveedor (pestaña Compra → Proveedores): solo para buscar en Cotiza y mostrarlos a Eunice.
    const prov = [];
    if (tmplIds.length) {
      prov.push(...await call("product.supplierinfo", "search_read", {
        domain: [["product_tmpl_id", "in", tmplIds], ["product_code", "!=", false]],
        fields: ["id", "partner_id", "product_id", "product_tmpl_id", "product_code"],
        limit: 5000
      }));
    }
    const provDe = indexarProveedores(prov);
    const extras = (r) => {
      const o = {};
      const cat = Array.isArray(r.categ_id) ? String(r.categ_id[1]).split(" / ").pop().trim() : "";
      if (cat) o.cat = cat;
      const pv = provDe(r);
      if (pv.length) o.prov = pv;
      return o;
    };
    const out = [], revisar = [];
    for (const r of rows) {
      if (r.default_code && skip.has(String(r.default_code).toUpperCase())) continue;
      if (r.default_code === "KK-LIBRE") continue;
      const p = Number(r.list_price) || 0, c = Number(r.standard_price) || 0;
      const nombre = String(r.display_name).replace(/^\[[^\]]+\]\s*/, "").trim();
      if (p <= 1 || (c > 0 && p / c > 20)) { revisar.push({ id: r.id, n: nombre, p, c }); continue; }
      const iva = (r.taxes_id || []).length > 0;
      const code = r.default_code || undefined;
      const tr = tramos.get(m2oId(r.product_tmpl_id));
      if (tr && tr.length) {
        out.push({ k: String(r.id), id: r.id, n: nombre, p, c, iva, code, t: tr, min: tr[0][0] || undefined, ...extras(r) });
        continue;
      }
      const ex = extras(r);
      out.push({ k: String(r.id), id: r.id, n: nombre, p, c, iva, code, ...ex });
      for (const t of tecnicas.get(m2oId(r.product_tmpl_id)) || []) {
        out.push({ k: `${r.id}-${t.ptav}`, id: r.id, ptav: t.ptav, n: `${nombre} · ${t.n}`,
          p: r2(p + t.extra), c: r2(c + t.extra / (1 + MARKUP_PERSONALIZACION)), iva, code, ...ex });   // se encuentra por el SKU de su base
      }
    }
    return json({ productos: out, revisar, at: new Date().toISOString() });
  } catch (e) {
    return fail(e.message, 502);
  }
}
