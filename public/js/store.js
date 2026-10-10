// Datos locales, llamadas a la API, cola de sincronización y sello.
import { calc } from "./calc.js?v=0.3.5";
import { canonical, sealFromBytes } from "./canonical.js?v=0.3.5";

// ---------- localStorage ----------
export const ls = {
  get(k, d) { try { const v = localStorage.getItem("kk_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kk_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("kk_" + k); } catch {} }
};

// ---------- Errores recientes (para el diagnóstico de "Reportar un problema") ----------
const errMem = [];
export function logError(e) {
  errMem.push({ fecha: new Date().toISOString(), ...e });
  if (errMem.length > 30) errMem.shift();
  ls.set("errlog", [...ls.get("errlog", []), errMem[errMem.length - 1]].slice(-30));
}
export const recentErrors = () => { const l = ls.get("errlog", null); return Array.isArray(l) && l.length ? l : errMem.slice(); };

// ---------- API ----------
export class AuthError extends Error {}
export async function api(path, opts = {}) {
  const ruta = path.split("?")[0];
  let r;
  try {
    r = await fetch("/api/" + path, {
      credentials: "same-origin",
      headers: opts.body ? { "content-type": "application/json" } : {},
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) {
    logError({ tipo: "api", ruta, status: 0, mensaje: e.message || "Sin red" });
    throw e;
  }
  let data = null; try { data = await r.json(); } catch {}
  // requestId: cruza este error con el log del servidor (wrangler tail y Ajustes → Registro del servidor).
  const requestId = (data && data.requestId) || r.headers.get("x-request-id") || "";
  if (!r.ok) logError({ tipo: "api", ruta, status: r.status, mensaje: (data && data.error) || "Error " + r.status, ...(requestId ? { requestId } : {}) });
  // 403 con auth:true = el correo perdió acceso; otros 403 son reglas de negocio.
  if (r.status === 401 || (r.status === 403 && data && data.auth)) throw new AuthError((data && data.error) || "Sin sesión");
  if (!r.ok) {
    const msg = (data && data.error) || "Error " + r.status;
    // Errores del servidor u Odoo llevan un código corto para buscarlos en el registro: "(ref 8c1f2a)".
    const e = new Error(r.status >= 500 && requestId ? `${msg} (ref ${requestId.slice(0, 6)})` : msg);
    e.status = r.status; e.requestId = requestId;
    throw e;
  }
  return data;
}

// ---------- IndexedDB: llave del sello (no extraíble) y bandeja de salida ----------
function idb() {
  return new Promise((res, rej) => {
    const o = indexedDB.open("kuukum", 2);
    o.onupgradeneeded = () => {
      const db = o.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox");
    };
    o.onsuccess = () => res(o.result);
    o.onerror = () => rej(o.error);
  });
}
async function idbDo(mode, fn, store = "keys") {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
export async function saveSealKey(email, b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  await idbDo("readwrite", (s) => s.put(key, "seal:" + email));
}
export async function hasSealKey(email) {
  try { return !!(await idbDo("readonly", (s) => s.get("seal:" + email))); } catch { return false; }
}
export async function sign(q) {
  const key = await idbDo("readonly", (s) => s.get("seal:" + q.creadoPor));
  if (!key) throw new Error("No hay llave de sello en este teléfono. Entra con internet una vez.");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical(q, calc(q))));
  return sealFromBytes(sig);
}
export async function clearKeys() {
  try { await idbDo("readwrite", (s) => s.clear()); } catch {}
}

// ---------- Cotizaciones ----------
export const quotes = {
  all() { return ls.get("quotes", []); },
  get(uuid) { return this.all().find((q) => q.uuid === uuid); },
  put(q) {
    const list = this.all();
    const i = list.findIndex((x) => x.uuid === q.uuid);
    if (i >= 0) list[i] = q; else list.unshift(q);
    ls.set("quotes", list.slice(0, 500));
  },
  remove(uuid) { ls.set("quotes", this.all().filter((x) => x.uuid !== uuid)); }
};

export function nextFolio(user) {
  const key = "folio_" + user.email;
  const n = Math.max(ls.get(key, 0), user.ultimoFolio || 0) + 1;
  ls.set(key, n);
  return `KK-${user.prefijo}${String(n).padStart(4, "0")}`;
}

// ---------- Cola de sincronización ----------
let running = false;
export const revOf = (q) => Number(q.rev) || 1;
export function needsSync(q) {
  if (q.estado === "borrador" || q.sync === "conflicto") return false;   // conflicto: ya es pedido en Odoo, no reintentar
  return !q.odoo || revOf(q) > (q.odoo.rev || 1) || (q.enviada && !q.odoo.enviada) || !!q.correoPend;
}
// Últimos errores de sync, para el diagnóstico de "Reportar un problema".
function logSyncError(q, msg) {
  ls.set("syncErrors", [...ls.get("syncErrors", []), { fecha: new Date().toISOString(), folio: q.folio, rev: revOf(q), error: msg }].slice(-5));
}
// pdfBase64(q): lo da la app; el PDF del correo se arma al enviarlo, ya con el número S000xx de Odoo.
export async function syncAll(onChange, { pdfBase64 } = {}) {
  if (running || !navigator.onLine) return { skipped: true };
  running = true;
  let ok = 0, err = 0, correos = 0, auth = null;
  try {
    for (const q of quotes.all().filter(needsSync).reverse()) {
      try {
        const r = await api("sync", { method: "POST", body: { quote: { ...q, revPrev: undefined } } });
        let cur = quotes.get(q.uuid);
        if (!cur) continue;
        cur.odoo = { id: r.id, name: r.name, enviada: r.enviada, rev: r.rev };
        cur.sync = "ok"; cur.syncError = "";
        if (r.rev >= revOf(cur)) delete cur.revPrev;
        quotes.put(cur); ok++;
        // Correo: siempre después del sync, y solo si Odoo ya tiene esta revisión.
        if (cur.correoPend && r.rev === revOf(cur) && pdfBase64) {
          if (await sendCorreo(cur, pdfBase64)) correos++;
        }
      } catch (e) {
        if (e instanceof AuthError) { auth = e.message; break; }
        const cur = quotes.get(q.uuid);
        if (!cur) continue;
        cur.sync = e.status === 409 ? "conflicto" : "error"; cur.syncError = e.message;
        logSyncError(cur, e.message);
        quotes.put(cur); err++;
      }
      onChange && onChange();
    }
  } finally { running = false; }
  if (!auth && !err) ls.set("lastSync", new Date().toISOString());
  return { ok, err, correos, auth };
}

async function sendCorreo(q, pdfBase64) {
  try {
    const r = await api("correo", { method: "POST", body: { uuid: q.uuid, rev: revOf(q), force: !!q.correoPend.force, pdfBase64: pdfBase64(q) } });
    const cur = quotes.get(q.uuid);
    cur.correo = { fecha: r.fecha, email: r.email, rev: r.rev };
    cur.correoPend = null; cur.correoError = "";
    cur.enviada = true; cur.estado = "enviada";
    if (cur.odoo) cur.odoo.enviada = true;
    quotes.put(cur);
    return true;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    const cur = quotes.get(q.uuid);
    cur.correoError = e.message;
    if (e.status === 403) cur.correoPend = null;          // no cumple la regla de cliente cautivo: no reintentar
    quotes.put(cur);
    return false;
  }
}

// ---------- Bandeja de salida (reportes hechos sin internet) ----------
export const outbox = {
  put: (item) => idbDo("readwrite", (s) => s.put(item, item.clientId), "outbox"),
  all: async () => (await idbDo("readonly", (s) => s.getAll(), "outbox")) || [],
  del: (id) => idbDo("readwrite", (s) => s.delete(id), "outbox")
};
// Manda los reportes en cola. Devuelve los IDs (CT-0001…) que se enviaron.
export async function flushOutbox() {
  if (!navigator.onLine) return [];
  const sent = [];
  let items = [];
  try { items = await outbox.all(); } catch { return sent; }
  for (const item of items) {
    try {
      const r = await api("reportes", { method: "POST", body: item });
      await outbox.del(item.clientId); sent.push(r.id);
    } catch (e) {
      if (e instanceof AuthError || !e.status) break;          // sin sesión o sin red: se reintenta después
      if (e.status < 500) {                                      // datos inválidos: no se va a arreglar solo
        logSyncError({ folio: "reporte" }, e.message); await outbox.del(item.clientId);
      }
    }
  }
  return sent;
}
