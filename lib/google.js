// Verifica un ID token de Google (RS256) sin dependencias.
let jwksCache = { at: 0, keys: [] };

async function googleKeys() {
  if (Date.now() - jwksCache.at < 3600e3 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("No se pudieron leer las llaves de Google");
  jwksCache = { at: Date.now(), keys: (await r.json()).keys };
  return jwksCache.keys;
}
const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function verifyGoogleIdToken(token, clientId) {
  const [h, p, s] = String(token).split(".");
  if (!s) throw new Error("Token mal formado");
  const header = JSON.parse(new TextDecoder().decode(dec(h)));
  const payload = JSON.parse(new TextDecoder().decode(dec(p)));
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") throw new Error("Llave de firma desconocida");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, dec(s), new TextEncoder().encode(h + "." + p));
  if (!ok) throw new Error("Firma inválida");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("Emisor inválido");
  if (payload.aud !== clientId) throw new Error("Token de otra aplicación");
  if (payload.exp * 1000 < Date.now()) throw new Error("Token vencido");
  if (!payload.email_verified) throw new Error("Correo no verificado");
  return { email: String(payload.email).toLowerCase(), name: payload.name || payload.email };
}
