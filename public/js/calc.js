// Cálculos de la cotización. Compartido por la app y por la API (functions).
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export const MARGEN_MAX = 95;
// Margen de una línea en %, o null si no hay precio. Puede ser negativo (vender bajo costo).
export function margenLinea(p, c) { p = Number(p) || 0; c = Number(c) || 0; return p > 0 ? ((p - c) / p) * 100 : null; }
// Precio unitario para un margen dado, redondeado a centavos. null si no se puede (sin costo o margen fuera de rango).
export function precioDesdeMargen(c, m) {
  c = Number(c) || 0; m = Number(m);
  if (!(c > 0) || !Number.isFinite(m) || m < 0 || m > MARGEN_MAX) return null;
  return r2(c / (1 - m / 100));
}

export function calc(q) {
  const items = q.items || [];
  const sub = r2(items.reduce((a, i) => a + i.q * i.p, 0));
  const costo = r2(items.reduce((a, i) => a + i.q * (i.c || 0), 0));
  const desc = r2(sub * ((Number(q.desc) || 0) / 100));
  const base = r2(sub - desc);
  const iva = q.iva ? r2(base * 0.16) : 0;
  const total = r2(base + iva);
  const ganancia = r2(base - costo);
  const margen = base > 0 ? (ganancia / base) * 100 : 0;
  const anticipo = r2(total * ((Number(q.anticipoPct) || 0) / 100));
  const saldo = r2(total - anticipo);
  return { sub, costo, desc, base, iva, total, ganancia, margen, anticipo, saldo };
}

// Precio capturado a mano (es-MX): "1,500" -> 1500 · "1500.50" -> 1500.5 · "150,50" -> 150.5 · "$1,500.50" -> 1500.5.
// Una sola coma seguida de 1–2 dígitos al final es decimal; si no, la coma separa miles.
export function parseMoney(v) {
  let s = String(v ?? "").replace(/[\s$]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? r2(n) : 0;
}

export const money = (v) =>
  "$" + r2(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tramos por volumen: [[piezas mínimas, precio], ...] de menor a mayor. Precio del tramo que aplica a q piezas
// (abajo del primer tramo se usa el primero: el mínimo es solo aviso).
export function precioTramo(t, q) {
  if (!t || !t.length) return null;
  let p = t[0][1];
  for (const [d, pr] of t) if (Number(q) >= d) p = pr;
  return p;
}
// Texto del tramo que aplica: "50–999 pzs" o "1,000+ pzs".
export function tramoTexto(t, q) {
  if (!t || !t.length) return "";
  let i = 0;
  t.forEach(([d], k) => { if (Number(q) >= d) i = k; });
  const f = (n) => Number(n).toLocaleString("es-MX");
  return i < t.length - 1 ? `${f(t[i][0])}–${f(t[i + 1][0] - 1)} pzs` : `${f(t[i][0])}+ pzs`;
}
