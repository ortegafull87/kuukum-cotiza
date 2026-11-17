import { fail } from "../../lib/core.js";

// Liga del producto en la tienda (tienda.kuukum.mx) para el botón "Ver en la tienda" de la ficha.
// GET /api/tienda?sku=KP004N&ant=KU-PLU-1115A-NEG → { url } del producto padre en WooCommerce (404 si no está publicado).
// Usa la Store API pública de WooCommerce: no necesita llaves. El padre se nombra igual que en geek-sync:
// SKU compacto sin la letra de color (KP004N → KP004) o, en el formato anterior, los 3 primeros segmentos.
// `ant` (SKU anterior) cubre las horas en que la tienda todavía no se renombra después de la migración.
export const skuPadre = (sku) => (/^K[A-Z]\d{3}[A-Z0-9]?$/.test(sku) ? sku.slice(0, 5) : sku.split("-").slice(0, 3).join("-"));
export const candidatosTienda = (sku, ant) => [...new Set([sku, ant].filter(Boolean).flatMap((s) => [skuPadre(s), s]))];

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const sku = String(q.get("sku") || "").trim().toUpperCase(), ant = String(q.get("ant") || "").trim().toUpperCase();
  if (!sku) return fail("Falta el SKU", 400);
  try {
    for (const s of candidatosTienda(sku, ant)) {
      const r = await fetch("https://tienda.kuukum.mx/wp-json/wc/store/v1/products?sku=" + encodeURIComponent(s), { cf: { cacheTtl: 3600 } });
      if (!r.ok) continue;
      const [p] = await r.json();
      if (p && p.permalink) return Response.json({ url: p.permalink }, { headers: { "cache-control": "private, max-age=86400" } });
    }
    return Response.json({ url: null }, { status: 404 });
  } catch (e) {
    return fail("No se pudo consultar la tienda", 502);
  }
}
