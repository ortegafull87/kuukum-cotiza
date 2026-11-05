import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

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
      fields: ["id", "display_name", "default_code", "list_price", "standard_price", "taxes_id", "product_tmpl_id"],
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
    const out = [], revisar = [];
    for (const r of rows) {
      if (r.default_code && skip.has(String(r.default_code).toUpperCase())) continue;
      if (r.default_code === "KK-LIBRE") continue;
      const p = Number(r.list_price) || 0, c = Number(r.standard_price) || 0;
      const nombre = String(r.display_name).replace(/^\[[^\]]+\]\s*/, "").trim();
      if (p <= 1 || (c > 0 && p / c > 20)) { revisar.push({ id: r.id, n: nombre, p, c }); continue; }
      const iva = (r.taxes_id || []).length > 0;
      out.push({ k: String(r.id), id: r.id, n: nombre, p, c, iva });
      for (const t of tecnicas.get(m2oId(r.product_tmpl_id)) || []) {
        out.push({ k: `${r.id}-${t.ptav}`, id: r.id, ptav: t.ptav, n: `${nombre} · ${t.n}`,
          p: r2(p + t.extra), c: r2(c + t.extra / (1 + MARKUP_PERSONALIZACION)), iva });
      }
    }
    return json({ productos: out, revisar, at: new Date().toISOString() });
  } catch (e) {
    return fail(e.message, 502);
  }
}
