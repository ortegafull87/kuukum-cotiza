import { fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

// Imagen principal de un producto de Odoo (image_512), para el ícono (i) de la línea en Cotiza.
// GET /api/imagen?id=<product.product id>. 404 si no tiene foto. El teléfono la guarda un día en caché.
export async function onRequestGet({ request, env, data }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!(id > 0)) return fail("Falta el id del producto", 400);
  try {
    const call = odoo(env, data.log);
    const [r] = await call("product.product", "read", { ids: [id], fields: ["image_512"] });
    if (!r || !r.image_512) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(r.image_512), (c) => c.charCodeAt(0));
    const tipo = bin[0] === 0xff ? "image/jpeg" : bin[0] === 0x52 ? "image/webp" : bin[0] === 0x3c ? "image/svg+xml" : "image/png";
    return new Response(bin, { headers: { "content-type": tipo, "cache-control": "private, max-age=86400" } });
  } catch (e) {
    return fail(e.message, 502);
  }
}
