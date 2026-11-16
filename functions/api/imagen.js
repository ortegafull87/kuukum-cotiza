import { fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

// Fotos de un producto de Odoo para la ficha (i) de Cotiza.
// GET /api/imagen?id=<product.product>&n=1 → foto principal (image_512).
// GET /api/imagen?id=<product.product>&n=2 → Foto 2 (diseño Kuu Kum): adjunto "Foto 2 - …" del template, la misma
// que geek-sync sube a la tienda. 404 si no hay. El teléfono la guarda un día en caché.
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id")), n = url.searchParams.get("n") === "2" ? 2 : 1;
  if (!(id > 0)) return fail("Falta el id del producto", 400);
  try {
    const call = odoo(env, data.log);
    let b64 = null;
    if (n === 1) {
      const [r] = await call("product.product", "read", { ids: [id], fields: ["image_512"] });
      b64 = r && r.image_512;
    } else {
      const [p] = await call("product.product", "read", { ids: [id], fields: ["product_tmpl_id"] });
      const tmpl = p && Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null;
      if (tmpl) {
        const [a] = await call("ir.attachment", "search_read", {
          domain: [["res_model", "=", "product.template"], ["res_id", "=", tmpl], ["name", "=like", "Foto 2 - %"]],
          fields: ["raw"], limit: 1, order: "id desc"
        });
        b64 = a && a.raw;   // Odoo 19.3: el contenido del adjunto va en `raw` (datas ya no existe)
      }
    }
    if (!b64) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const tipo = bin[0] === 0xff ? "image/jpeg" : bin[0] === 0x52 ? "image/webp" : bin[0] === 0x3c ? "image/svg+xml" : "image/png";
    return new Response(bin, { headers: { "content-type": tipo, "cache-control": "private, max-age=86400" } });
  } catch (e) {
    return fail(e.message, 502);
  }
}
