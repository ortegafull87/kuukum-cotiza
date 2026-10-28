import { json } from "../../lib/core.js";
import { recentServerErrors } from "../../lib/log.js";

// Últimos 50 errores del servidor (status ≥ 500 o error de Odoo), para Ajustes → Registro del servidor.
export async function onRequestGet({ env }) {
  return json({ errores: await recentServerErrors(env, 50) });
}
