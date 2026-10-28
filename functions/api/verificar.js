import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";
import { cleanSeal, splitFolio } from "../../public/js/canonical.js";

// estado: autentica | anterior | invalido | desconocido (resultado del sello).
// estadoOdoo: draft | sent | sale | cancel | eliminada (si el sello es válido): un sello auténtico de una cotización
// cancelada o eliminada sigue siendo auténtico, pero la cotización ya no está vigente.
export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const { folio } = splitFolio(u.searchParams.get("folio"));   // acepta AP-L0012-R2 y KK-L0012-R2
  const sello = cleanSeal(u.searchParams.get("sello"));
  if (!folio || !sello) return fail("Escribe el folio y el sello.");
  const rec = await env.KK.get("seal:" + folio, "json");
  if (!rec) return json({ estado: "desconocido", folio });
  data.log.folio = folio;
  const vigente = rec.rev || 1;
  const h = rec.sello === sello ? null : (rec.historial || []).find((x) => x.sello === sello);
  if (rec.sello !== sello && !h) return json({ estado: "invalido", folio });
  const estadoOdoo = await estadoEnOdoo(env, data.log, rec.odoo);
  const extra = estadoOdoo ? { estadoOdoo } : {};
  if (!h) return json({ estado: "autentica", folio, rev: vigente, ...rec.snapshot, odoo: rec.odoo, creadoPor: rec.email, ...extra });
  return json({
    estado: "anterior", folio, rev: h.rev, vigente, odoo: rec.odoo,
    totalAnterior: h.total, fechaAnterior: h.fecha, total: rec.snapshot.total, fecha: rec.snapshot.fecha, ...extra
  });
}

// Si Odoo no responde, se omite: el sello se puede verificar igual.
async function estadoEnOdoo(env, log, name) {
  if (!name) return null;
  try {
    const [so] = await odoo(env, log)("sale.order", "search_read", { domain: [["name", "=", name]], fields: ["state"], limit: 1 });
    return so ? so.state : "eliminada";
  } catch { return null; }
}
