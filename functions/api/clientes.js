import { json, fail } from "../../lib/core.js";
import { odoo, m2o } from "../../lib/odoo.js";

// Clientes de Odoo con su número de pedidos confirmados (por empresa, contando contactos hijos).
// "cautivo" = al menos una venta y con correo: solo a ellos se les puede mandar la cotización por correo.
export async function onRequestGet({ env, data }) {
  try {
    const call = odoo(env, data.log);
    const [rows, ventas] = await Promise.all([
      call("res.partner", "search_read", {
        domain: [["customer_rank", ">", 0], ["active", "=", true]],
        fields: ["id", "name", "phone", "email", "commercial_partner_id"],
        order: "name asc",
        limit: 5000
      }),
      ventasPorEmpresa(call)
    ]);
    return json({
      clientes: rows.map((r) => {
        const n = ventas.get(m2o(r.commercial_partner_id) || r.id) || 0;
        return { id: r.id, nombre: r.name, tel: r.phone || "", email: r.email || "", ventas: n, cautivo: n >= 1 && !!r.email };
      }),
      at: new Date().toISOString()
    });
  } catch (e) {
    return fail(e.message, 502);
  }
}

// commercial_partner_id -> número de sale.order en estado "sale".
async function ventasPorEmpresa(call) {
  const orders = await call("sale.order", "search_read", { domain: [["state", "=", "sale"]], fields: ["partner_id"], limit: 20000 });
  const ids = [...new Set(orders.map((o) => m2o(o.partner_id)).filter(Boolean))];
  const partners = ids.length ? await call("res.partner", "read", { ids, fields: ["commercial_partner_id"] }) : [];
  const empresa = new Map(partners.map((p) => [p.id, m2o(p.commercial_partner_id) || p.id]));
  const out = new Map();
  for (const o of orders) {
    const e = empresa.get(m2o(o.partner_id));
    if (e) out.set(e, (out.get(e) || 0) + 1);
  }
  return out;
}
