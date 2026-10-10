// Utilidades del servidor: respuestas, sesión, configuración, sello.
import { canonical, sealFromBytes } from "../public/js/canonical.js";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
export const fail = (msg, status = 400) => json({ error: msg }, status);

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function hmacKey(secret, usage = ["sign", "verify"]) {
  return crypto.subtle.importKey("raw", typeof secret === "string" ? enc.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" }, false, usage);
}
async function hmac(secret, data) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Sesión (cookie HttpOnly firmada) ----------
export const SESSION_DAYS = 30;
export async function makeSession(env, email, name) {
  const payload = b64u(enc.encode(JSON.stringify({ email, name, exp: Date.now() + SESSION_DAYS * 864e5 })));
  return payload + "." + b64u(await hmac(env.SESSION_SECRET, payload));
}
export async function readSession(env, request) {
  const raw = getCookie(request, "kk_session");
  if (!raw || !raw.includes(".")) return null;
  const [payload, sig] = raw.split(".");
  if (!safeEqual(sig, b64u(await hmac(env.SESSION_SECRET, payload)))) return null;
  const data = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
  return data.exp > Date.now() ? data : null;
}
export function getCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
export const sessionCookie = (value, maxAge) =>
  `kk_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- Configuración editable (KV "config") ----------
export const DEFAULT_CONFIG = {
  empresa: "Kuu Kum Personalizados",
  titular: "Loida Eunice Godínez Reyna",
  rfc: "GORL820410LM4",
  email: "lgodinez@kuukum.mx",
  telefono: "446 403 6941",
  whatsapp: "446 403 6941",
  sitio_web: "kuukum.mx",
  instagram: "",
  facebook: "",
  tiktok: "",
  direccion: "Av. Pirámide de la Luna 229, B21, Pirámides El Pueblito, Corregidora, Qro.",
  banco: "BBVA",
  clabe: "012 680 00490344672 2",
  beneficiario: "Loida Eunice Godínez Reyna",
  anticipo_pct: 60,
  entrega_texto: "5 a 7 días hábiles",
  vigencia_dias: 15,
  terminos: "Se requiere el anticipo para confirmar el pedido; el resto es contra entrega. Para aceptar, envía un mensaje por WhatsApp. El pedido entra a producción al confirmar el anticipo.",
  iva_tax_id: 14,
  usuarios_permitidos: "",
  prefijos: { "loidaegr@gmail.com": "L", "ortegafull87@gmail.com": "V", "kuukum.mx@gmail.com": "K" },
  excluir_codigos: "GAS,INS,MAN,OTR,PAP,PUB,SER,TRA",
  reportes_email: "hola@kuukum.com",
  // Remitente de los correos que manda Odoo: debe ser del dominio de Odoo (from_filter kuukum.odoo.com) para pasar SPF/DMARC.
  correo_remitente: "notifications@kuukum.odoo.com",
  correo_cotizacion: "Hola {cliente}:\n\nTe compartimos la cotización {folio} por {total}, válida hasta el {vigencia}. Va adjunta en PDF.\n\nSi tienes dudas o quieres confirmarla, escríbenos por WhatsApp al {whatsapp}.\n\n¡Gracias por tu confianza!"
};
export async function getConfig(env) {
  const saved = (await env.KK.get("config", "json")) || {};
  return { ...DEFAULT_CONFIG, ...saved, prefijos: { ...DEFAULT_CONFIG.prefijos, ...(saved.prefijos || {}) } };
}
export function allowedEmails(env, cfg) {
  const list = (cfg.usuarios_permitidos || env.ALLOWED_EMAILS || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

// ---------- Sello ----------
// Cada usuario firma con su propia llave derivada; la llave maestra nunca sale de Cloudflare.
export async function deviceSealKey(env, email) {
  return hmac(env.SEAL_SECRET, "seal:" + email.toLowerCase());
}
export async function sealFor(env, email, quote, totals) {
  const key = await deviceSealKey(env, email);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(key, ["sign"]), enc.encode(canonical(quote, totals)));
  return sealFromBytes(sig);
}
