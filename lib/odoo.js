// Cliente mínimo para la API JSON-2 de Odoo 19: POST /json/2/<modelo>/<método>
export function odoo(env) {
  const base = (env.ODOO_URL || "").replace(/\/$/, "");
  return async function call(model, method, body = {}) {
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
  };
}

// Busca por nombre o crea, y recuerda el id en KV.
export async function getOrCreate(env, call, model, domain, vals, cacheKey) {
  if (cacheKey) { const c = await env.KK.get(cacheKey); if (c) return Number(c); }
  const found = await call(model, "search", { domain, limit: 1 });
  const id = found && found.length ? found[0] : (await call(model, "create", { vals_list: [vals] }))[0];
  if (cacheKey) await env.KK.put(cacheKey, String(id));
  return id;
}
