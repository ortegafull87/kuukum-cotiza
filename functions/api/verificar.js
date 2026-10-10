import { json, fail } from "../../lib/core.js";
import { cleanSeal, splitFolio } from "../../public/js/canonical.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const { folio } = splitFolio(u.searchParams.get("folio"));   // acepta KK-L0012-R2
  const sello = cleanSeal(u.searchParams.get("sello"));
  if (!folio || !sello) return fail("Escribe el folio y el sello.");
  const rec = await env.KK.get("seal:" + folio, "json");
  if (!rec) return json({ estado: "desconocido", folio });
  const vigente = rec.rev || 1;
  if (rec.sello === sello) return json({ estado: "autentica", folio, rev: vigente, ...rec.snapshot, odoo: rec.odoo, creadoPor: rec.email });
  const h = (rec.historial || []).find((x) => x.sello === sello);
  if (h) {
    return json({
      estado: "anterior", folio, rev: h.rev, vigente, odoo: rec.odoo,
      totalAnterior: h.total, fechaAnterior: h.fecha, total: rec.snapshot.total, fecha: rec.snapshot.fecha
    });
  }
  return json({ estado: "invalido", folio });
}
