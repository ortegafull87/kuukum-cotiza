// Logs estructurados de la API: una línea JSON por petición (visible en `wrangler pages deployment tail`)
// y registro persistente en KV de los errores (status ≥ 500 o cualquier error de Odoo), 30 días.
// Nunca se registran: API key, cookies, sello o llave, PDF, fotos ni datos personales completos (del cliente solo su id de Odoo).

const TTL = 30 * 86400;
// Clave con tiempo invertido para que KV.list() regrese primero lo más reciente.
const keyFor = (ts, id) => `errlog:${String(9999999999999 - ts).padStart(13, "0")}:${id}`;
const cut = (s, n = 300) => String(s ?? "").slice(0, n);

// requestId corto: la parte hexadecimal de cf-ray (se cruza con los logs de Cloudflare) o uno aleatorio.
export function startLog(request) {
  const ray = (request.headers.get("cf-ray") || "").split("-")[0];
  const requestId = /^[0-9a-f]{8,}$/i.test(ray) ? ray.toLowerCase() : crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const url = new URL(request.url);
  return { requestId, t0: Date.now(), method: request.method, ruta: url.pathname, odoo: [], usuario: null, folio: null, cliente: null, error: null };
}

// Agrega requestId al header y al cuerpo de los errores; escribe la línea JSON y, si aplica, el registro en KV.
export async function finishLog(context, log, res) {
  let out = new Response(res.body, res);
  if (!res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
    let body = {};
    try { body = await res.clone().json(); } catch {}
    log.error = log.error || cut(body.error, 500);
    out = new Response(JSON.stringify({ ...body, requestId: log.requestId }), res);
  }
  out.headers.set("x-request-id", log.requestId);

  const line = {
    ts: new Date(log.t0).toISOString(), requestId: log.requestId, method: log.method, ruta: log.ruta,
    status: out.status, ms: Date.now() - log.t0, usuario: log.usuario,
    ...(log.folio ? { folio: log.folio } : {}), ...(log.ticket ? { ticket: log.ticket } : {}), ...(log.cliente ? { cliente: log.cliente } : {}),
    odoo: log.odoo, ...(log.error ? { error: log.error } : {})
  };
  console.log(JSON.stringify(line));

  const odooFail = log.odoo.filter((o) => !o.ok);
  if ((out.status >= 500 || odooFail.length) && context.env.KK) {
    const rec = { ...line, mensaje: log.error || (odooFail[0] && odooFail[0].error) || "Error " + out.status };
    const meta = { ts: line.ts, requestId: line.requestId, method: line.method, ruta: line.ruta, status: line.status,
      usuario: line.usuario, mensaje: cut(rec.mensaje, 300), ...(line.folio ? { folio: line.folio } : {}), ...(line.ticket ? { ticket: line.ticket } : {}) };
    const put = context.env.KK.put(keyFor(log.t0, log.requestId), JSON.stringify(rec), { expirationTtl: TTL, metadata: meta }).catch(() => {});
    if (context.waitUntil) context.waitUntil(put); else await put;
  }
  return out;
}

// Últimos errores para Ajustes → Registro del servidor.
export async function recentServerErrors(env, limit = 50) {
  const { keys } = await env.KK.list({ prefix: "errlog:", limit });
  return keys.map((k) => k.metadata).filter(Boolean);
}
