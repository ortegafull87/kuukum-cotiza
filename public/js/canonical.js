// Texto canónico que se firma con el sello de autenticidad.
// Compartido por la app (firma) y la API (verificación). Si cambias el formato, sube la versión "v1".
const norm = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();
const digits = (s) => String(s || "").replace(/\D/g, "");

export function canonical(q, t) {
  return [
    "kk-v1",
    norm(q.folio),
    String(q.fecha || "").slice(0, 10),
    norm(q.cliente && q.cliente.nombre),
    digits(q.cliente && q.cliente.tel),
    ...(q.items || []).map((i) => `${Number(i.q)}|${Number(i.p).toFixed(2)}|${norm(i.n)}`),
    `desc:${Number(q.desc) || 0}`,
    `iva:${q.iva ? 1 : 0}`,
    `total:${t.total.toFixed(2)}`,
    `anticipo:${t.anticipo.toFixed(2)}`
  ].join("\n");
}

// Crockford base32 de los primeros 10 bytes (80 bits = 16 caracteres).
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function sealFromBytes(buf) {
  const b = new Uint8Array(buf).slice(0, 10);
  let bits = 0, val = 0, out = "";
  for (const x of b) {
    val = (val << 8) | x; bits += 8;
    while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out; // 16 caracteres
}
export const formatSeal = (s) => String(s || "").replace(/[^0-9A-Z]/gi, "").toUpperCase().match(/.{1,4}/g)?.join("-") || "";
export const cleanSeal = (s) => String(s || "").replace(/[^0-9A-Z]/gi, "").toUpperCase()
  .replace(/O/g, "0").replace(/[IL]/g, "1");
