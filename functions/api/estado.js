import { json, fail } from "../../lib/core.js";
import { odoo, odooFecha } from "../../lib/odoo.js";

const MAX = 200;

// Estado en Odoo de las cotizaciones que la app ya subió. Odoo manda: aquí solo se lee, nunca se cambia nada en Odoo.
// Entrada {uuids}; salida {estados: {uuid: {estado: draft|sent|sale|cancel|eliminada, odooName, fecha}}}.
export async function onRequestPost({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return fail("Cuerpo inválido"); }
  const uuids = [...new Set((Array.isArray(body && body.uuids) ? body.uuids : []).map(String))];
  if (uuids.length > MAX) return fail(`Máximo ${MAX} cotizaciones por consulta.`);
  if (!uuids.length) return json({ estados: {} });

  // sync:<uuid> -> id de sale.order (las que no tienen registro se omiten)
  const recs = (await Promise.all(uuids.map(async (u) => [u, await env.KK.get("sync:" + u, "json")]))).filter(([, r]) => r && r.id);
  if (!recs.length) return json({ estados: {} });
  data.log.folio = `${recs.length} cotización(es)`;

  try {
    const rows = await odoo(env, data.log)("sale.order", "search_read", {
      domain: [["id", "in", recs.map(([, r]) => r.id)]], fields: ["id", "state", "name", "write_date"]
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const estados = {};
    const writes = [];
    for (const [uuid, rec] of recs) {
      const so = byId.get(rec.id);
      const estado = so ? so.state : "eliminada";
      const fecha = so ? odooFecha(so.write_date) : (rec.estadoOdoo === "eliminada" && rec.estadoFecha) || null;
      estados[uuid] = { estado, odooName: so ? so.name : rec.name, fecha };
      // Se guarda para que /api/sync y /api/correo lo conozcan; solo se escribe si cambió.
      if (rec.estadoOdoo !== estado || rec.estadoFecha !== fecha) {
        writes.push(env.KK.put("sync:" + uuid, JSON.stringify({ ...rec, estadoOdoo: estado, estadoFecha: fecha })));
      }
    }
    await Promise.all(writes);
    return json({ estados });
  } catch (e) {
    return fail(e.message, 502);
  }
}
