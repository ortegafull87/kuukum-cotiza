import { json, b64, deviceSealKey } from "../../lib/core.js";

// Datos del usuario, su prefijo de folio, el último folio usado y su llave de sello.
export async function onRequestGet({ env, data }) {
  const { user, config } = data;
  const prefijo = (config.prefijos[user.email] || user.email[0]).toUpperCase();
  const ultimoFolio = Number(await env.KK.get("folio:" + user.email)) || 0;
  return json({
    email: user.email,
    nombre: user.name,
    prefijo,
    ultimoFolio,
    odooUrl: (env.ODOO_URL || "").replace(/\/$/, ""),
    sealKey: b64(await deviceSealKey(env, user.email))
  });
}
