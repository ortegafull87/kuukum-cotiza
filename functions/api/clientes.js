import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

export async function onRequestGet({ env }) {
  try {
    const rows = await odoo(env)("res.partner", "search_read", {
      domain: [["customer_rank", ">", 0], ["active", "=", true]],
      fields: ["id", "name", "phone", "email"],
      order: "name asc",
      limit: 5000
    });
    return json({
      clientes: rows.map((r) => ({ id: r.id, nombre: r.name, tel: r.phone || "", email: r.email || "" })),
      at: new Date().toISOString()
    });
  } catch (e) {
    return fail(e.message, 502);
  }
}
