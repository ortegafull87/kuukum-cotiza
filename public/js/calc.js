// Cálculos de la cotización. Compartido por la app y por la API (functions).
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

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

export const money = (v) =>
  "$" + r2(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
