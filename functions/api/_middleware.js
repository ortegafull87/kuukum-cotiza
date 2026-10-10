import { readSession, getConfig, allowedEmails, json, fail } from "../../lib/core.js";

// Todo /api/* exige sesión válida de un correo permitido, salvo el login.
export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/auth/")) return next();
  if (!env.KK) return fail("Falta el KV 'KK' en la configuración de Cloudflare.", 500);
  try {
    const s = await readSession(env, request);
    if (!s) return fail("Sesión vencida. Vuelve a entrar con Google.", 401);
    const cfg = await getConfig(env);
    // auth: true distingue "sin acceso" de un 403 de regla de negocio (p. ej. correo a cliente no cautivo).
    if (!allowedEmails(env, cfg).has(s.email)) return json({ error: "Este correo ya no tiene acceso.", auth: true }, 403);
    context.data.user = s;
    context.data.config = cfg;
    return await next();
  } catch (e) {
    return fail(e.message || "Error inesperado", 500);
  }
}
