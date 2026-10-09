import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

// Productos vendibles de Odoo, sin gastos internos ni precios capturados mal.
export async function onRequestGet({ env, data }) {
  try {
    const call = odoo(env);
    const rows = await call("product.product", "search_read", {
      domain: [["sale_ok", "=", true], ["active", "=", true]],
      fields: ["id", "display_name", "default_code", "list_price", "standard_price", "taxes_id"],
      limit: 2000
    });
    const skip = new Set(String(data.config.excluir_codigos || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
    const out = [], revisar = [];
    for (const r of rows) {
      if (r.default_code && skip.has(String(r.default_code).toUpperCase())) continue;
      if (r.default_code === "KK-LIBRE") continue;
      const p = Number(r.list_price) || 0, c = Number(r.standard_price) || 0;
      const nombre = String(r.display_name).replace(/^\[[^\]]+\]\s*/, "").trim();
      if (p <= 1 || (c > 0 && p / c > 20)) { revisar.push({ id: r.id, n: nombre, p, c }); continue; }
      out.push({ id: r.id, n: nombre, p, c, iva: (r.taxes_id || []).length > 0 });
    }
    return json({ productos: out, revisar, at: new Date().toISOString() });
  } catch (e) {
    return fail(e.message, 502);
  }
}
