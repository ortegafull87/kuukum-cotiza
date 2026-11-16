import { fail } from "../../lib/core.js";

// Liga del producto en la tienda (tienda.kuukum.mx) para el botón "Ver en la tienda" de la ficha.
// GET /api/tienda?sku=KU-PLU-1115A-AZU → { url } del producto padre en WooCommerce (404 si no está publicado).
// Usa la Store API pública de WooCommerce: no necesita llaves. La tienda nombra al padre con los 3 primeros
// segmentos del SKU de Odoo (igual que geek-sync).
export async function onRequestGet({ request }) {
  const sku = String(new URL(request.url).searchParams.get("sku") || "").trim();
  if (!sku) return fail("Falta el SKU", 400);
  const base = sku.split("-").slice(0, 3).join("-");
  try {
    for (const s of [...new Set([base, sku])]) {
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
