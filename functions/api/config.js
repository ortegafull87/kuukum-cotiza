import { json, fail, DEFAULT_CONFIG } from "../../lib/core.js";

export async function onRequestGet({ data }) {
  return json(data.config);
}

// Guarda solo las llaves conocidas; no permite quedarse sin usuarios.
export async function onRequestPut({ request, env, data }) {
  const body = await request.json();
  const next = { ...data.config };
  for (const k of Object.keys(DEFAULT_CONFIG)) if (k in body) next[k] = body[k];
  next.anticipo_pct = Math.min(100, Math.max(0, Number(next.anticipo_pct) || 0));
  next.vigencia_dias = Math.max(1, Number(next.vigencia_dias) || 15);
  if (String(next.usuarios_permitidos || "").trim()) {
    const list = String(next.usuarios_permitidos).toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (!list.includes(data.user.email)) return fail("No puedes quitar tu propio correo de la lista de usuarios.");
  }
  await env.KK.put("config", JSON.stringify(next));
  return json(next);
}
