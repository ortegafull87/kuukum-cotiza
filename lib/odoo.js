// Cliente mínimo para la API JSON-2 de Odoo 19: POST /json/2/<modelo>/<método>
// Si recibe el log de la petición (lib/log.js), mide cada llamada y guarda el mensaje de Odoo cuando falla.
export function odoo(env, log = null) {
  const base = (env.ODOO_URL || "").replace(/\/$/, "");
  return async function call(model, method, body = {}) {
    const t0 = Date.now();
    try {
      const data = await raw(model, method, body);
      if (log) log.odoo.push({ modelo: model, metodo: method, ms: Date.now() - t0, ok: true });
      return data;
    } catch (e) {
      if (log) log.odoo.push({ modelo: model, metodo: method, ms: Date.now() - t0, ok: false, error: String(e.message).slice(0, 300) });
      throw e;
    }
  };
  async function raw(model, method, body) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      authorization: "bearer " + env.ODOO_API_KEY,
      "user-agent": "kuukum-cotiza/1.0"
    };
    if (env.ODOO_DB) headers["x-odoo-database"] = env.ODOO_DB;
    const r = await fetch(`${base}/json/2/${model}/${method}`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) {
      const msg = (data && (data.message || (data.error && data.error.message))) || String(text).slice(0, 300);
      throw new Error(`Odoo ${model}.${method}: ${msg}`);
    }
    return data;
  }
}

// Adjuntos en Odoo 19.3+: el contenido va en `raw` (base64 por RPC). `datas` ya no existe y Odoo lo ignora en silencio,
// dejando el adjunto en 0 bytes. Se verifica file_size contra los bytes reales para no mandar correos con adjuntos vacíos o rotos.
export const stripDataUrl = (s) => String(s || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
const b64Bytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
export async function createAttachment(call, vals, base64) {
  const raw = stripDataUrl(base64);
  const esperado = b64Bytes(raw);
  if (!esperado) throw new Error(`El adjunto ${vals.name} viene vacío.`);
  const [id] = await call("ir.attachment", "create", { vals_list: [{ ...vals, raw }] });
  const [a] = await call("ir.attachment", "read", { ids: [id], fields: ["file_size"] });
  const size = a ? Number(a.file_size) || 0 : 0;
  if (size !== esperado) {
    await call("ir.attachment", "unlink", { ids: [id] }).catch(() => {});
    throw new Error(`Odoo guardó el adjunto ${vals.name} con ${size} bytes (se esperaban ${esperado}). No se mandó el correo.`);
  }
  return id;
}

// Marca la cotización como "Cotización enviada".
export async function markSent(call, id) {
  try { await call("sale.order", "action_quotation_sent", { ids: [id] }); }
  catch { await call("sale.order", "write", { ids: [id], vals: { state: "sent" } }); }
}

// many2one llega como [id, nombre] o como id.
export const m2o = (v) => (Array.isArray(v) ? v[0] : v || false);

// Busca por nombre o crea, y recuerda el id en KV.
export async function getOrCreate(env, call, model, domain, vals, cacheKey) {
  if (cacheKey) { const c = await env.KK.get(cacheKey); if (c) return Number(c); }
  const found = await call(model, "search", { domain, limit: 1 });
  const id = found && found.length ? found[0] : (await call(model, "create", { vals_list: [vals] }))[0];
  if (cacheKey) await env.KK.put(cacheKey, String(id));
  return id;
}
