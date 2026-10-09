import { json, fail } from "../../lib/core.js";
import { cleanSeal } from "../../public/js/canonical.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const folio = String(u.searchParams.get("folio") || "").trim().toUpperCase();
  const sello = cleanSeal(u.searchParams.get("sello"));
  if (!folio || !sello) return fail("Escribe el folio y el sello.");
  const rec = await env.KK.get("seal:" + folio, "json");
  if (!rec) return json({ estado: "desconocido", folio });
  if (rec.sello !== sello) return json({ estado: "invalido", folio });
  return json({ estado: "autentica", folio, ...rec.snapshot, odoo: rec.odoo, creadoPor: rec.email });
}
