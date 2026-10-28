import { readSession, getConfig, allowedEmails, json, fail } from "../../lib/core.js";
import { startLog, finishLog } from "../../lib/log.js";

// Todo /api/* lleva requestId y log estructurado; exige sesión válida de un correo permitido, salvo el login.
export async function onRequest(context) {
  const log = startLog(context.request);
  context.data.log = log;
  let res;
  try { res = await handle(context); }
  catch (e) { log.error = e.message || "Error inesperado"; res = fail(log.error, 500); }
  return finishLog(context, log, res);
}

async function handle(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/auth/")) return next();
  if (!env.KK) return fail("Falta el KV 'KK' en la configuración de Cloudflare.", 500);
  const s = await readSession(env, request);
  if (!s) return fail("Sesión vencida. Vuelve a entrar con Google.", 401);
  context.data.log.usuario = s.email;
  const cfg = await getConfig(env);
  // auth: true distingue "sin acceso" de un 403 de regla de negocio (p. ej. correo a cliente no cautivo).
  if (!allowedEmails(env, cfg).has(s.email)) return json({ error: "Este correo ya no tiene acceso.", auth: true }, 403);
  context.data.user = s;
  context.data.config = cfg;
  return await next();
}
