// Datos locales, llamadas a la API, cola de sincronización y sello.
import { calc } from "./calc.js";
import { canonical, sealFromBytes } from "./canonical.js";

// ---------- localStorage ----------
export const ls = {
  get(k, d) { try { const v = localStorage.getItem("kk_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kk_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("kk_" + k); } catch {} }
};

// ---------- API ----------
export class AuthError extends Error {}
export async function api(path, opts = {}) {
  const r = await fetch("/api/" + path, {
    credentials: "same-origin",
    headers: opts.body ? { "content-type": "application/json" } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 || r.status === 403) throw new AuthError((data && data.error) || "Sin sesión");
  if (!r.ok) throw new Error((data && data.error) || "Error " + r.status);
  return data;
}

// ---------- Llave del sello en IndexedDB (no extraíble) ----------
function idb() {
  return new Promise((res, rej) => {
    const o = indexedDB.open("kuukum", 1);
    o.onupgradeneeded = () => o.result.createObjectStore("keys");
    o.onsuccess = () => res(o.result);
    o.onerror = () => rej(o.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction("keys", mode);
    const req = fn(tx.objectStore("keys"));
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
export function needsSync(q) {
  return q.estado !== "borrador" && (!q.odoo || (q.enviada && !q.odoo.enviada));
}
export async function syncAll(onChange) {
  if (running || !navigator.onLine) return { skipped: true };
  running = true;
  let ok = 0, err = 0, auth = null;
  try {
    for (const q of quotes.all().filter(needsSync).reverse()) {
      try {
        const r = await api("sync", { method: "POST", body: { quote: q } });
        const cur = quotes.get(q.uuid);
        cur.odoo = { id: r.id, name: r.name, enviada: r.enviada };
        cur.sync = "ok"; cur.syncError = "";
        quotes.put(cur); ok++;
      } catch (e) {
        if (e instanceof AuthError) { auth = e.message; break; }
        const cur = quotes.get(q.uuid);
        cur.sync = "error"; cur.syncError = e.message;
        quotes.put(cur); err++;
      }
      onChange && onChange();
    }
  } finally { running = false; }
  return { ok, err, auth };
}
