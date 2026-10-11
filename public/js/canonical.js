// Texto canónico que se firma con el sello de autenticidad.
// Compartido por la app (firma) y la API (verificación). Si cambias el formato, sube la versión.
// kk-v1: cotizaciones originales (rev 1). No cambiar: hay sellos emitidos con este formato.
// kk-v2: revisiones (rev ≥ 2) = kk-v1 + línea final "rev:N".
const norm = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();
const digits = (s) => String(s || "").replace(/\D/g, "");

export function canonical(q, t) {
  const rev = Number(q.rev) || 1;
  const lines = [
    rev > 1 ? "kk-v2" : "kk-v1",
    norm(q.folio),
    String(q.fecha || "").slice(0, 10),
    norm(q.cliente && q.cliente.nombre),
    digits(q.cliente && q.cliente.tel),
    ...(q.items || []).map((i) => `${Number(i.q)}|${Number(i.p).toFixed(2)}|${norm(i.n)}`),
    `desc:${Number(q.desc) || 0}`,
    `iva:${q.iva ? 1 : 0}`,
    `total:${t.total.toFixed(2)}`,
    `anticipo:${t.anticipo.toFixed(2)}`
  ];
  if (rev > 1) lines.push(`rev:${rev}`);
  return lines.join("\n");
}

// ---------- Folios ----------
// Las cotizaciones nuevas usan AP-<letra del usuario><consecutivo> (AP-K0006). Las anteriores conservan KK-… y siguen
// valiendo en todos lados. La letra por usuario evita folios repetidos entre teléfonos sin conexión; el consecutivo
// es uno solo por usuario para los dos prefijos (no se reinicia).
export const FOLIO_PREFIX = "AP";
export const FOLIO_RE = /^(KK|AP)-[A-Z]\d{4,}(-R\d+)?$/;   // \d{4,}: a partir de la 10000 son 5 dígitos
export const nuevoFolio = (letra, n) => `${FOLIO_PREFIX}-${letra}${String(n).padStart(4, "0")}`;
// Consecutivo de un folio de cualquiera de los dos prefijos ("KK-K0005" -> 5); 0 si no es un folio.
export const folioNumero = (folio) => { const m = /^(?:KK|AP)-[A-Z](\d+)/.exec(String(folio || "")); return m ? Number(m[1]) : 0; };

// Folio visible: AP-L0012 (rev 1), AP-L0012-R2, -R3… (igual con KK-)
export const folioVisible = (folio, rev) => (Number(rev) > 1 ? `${folio}-R${Number(rev)}` : String(folio || ""));
// "AP-L0012-R2" o "KK-L0012 · R2" -> { folio: "AP-L0012", rev: 2 }
export function splitFolio(s) {
  const t = String(s || "").trim().toUpperCase().replace(/\s*·\s*R(\d+)$/, "-R$1");
  const m = t.match(/^(.*\d)-R(\d+)$/);
  return m ? { folio: m[1], rev: Number(m[2]) } : { folio: t, rev: null };
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
