import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";
import { indexarProveedores } from "../../lib/proveedores.js";
import { sumarTramos, nombreTecnica, reglasTecnica } from "../../lib/precios.js";

// Regla de Kuu Kum para personalizaciones (técnicas como Láser): precio = costo de la técnica + 25 %.
// En Odoo el extra de la técnica guarda el PRECIO; el costo se saca de aquí para que el margen salga bien.
export const MARKUP_PERSONALIZACION = 0.25;
const ATTR_COLOR = 10;   // atributo COLOR de Odoo
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const m2oId = (v) => (Array.isArray(v) ? v[0] : v) || null;

// Productos vendibles de Odoo, sin gastos internos ni precios capturados mal.
// Además, por cada técnica de personalización con precio (atributo "no crea variantes" con extra > 0, p. ej. Láser
// en las plumas) se agrega una opción "<producto> · <técnica>" con el precio y el costo de la técnica sumados.
// Las técnicas con extra en 0 no se ofrecen: así no se cotiza una personalización sin cobrarla.
export async function onRequestGet({ env, data }) {
  try {
    const call = odoo(env, data.log);
    const rows = await call("product.product", "search_read", {
      domain: [["sale_ok", "=", true], ["active", "=", true]],
      fields: ["id", "display_name", "default_code", "x_sku_anterior", "list_price", "standard_price", "taxes_id", "product_tmpl_id", "categ_id", "product_template_attribute_value_ids"],
      limit: 2000
    });
    const skip = new Set(String(data.config.excluir_codigos || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
    const tmplIds = [...new Set(rows.map((r) => m2oId(r.product_tmpl_id)).filter(Boolean))];
    const tecnicas = new Map();   // template -> [{ ptav, n, extra }]
    if (tmplIds.length) {
      const ptavs = await call("product.template.attribute.value", "search_read", {
        domain: [["product_tmpl_id", "in", tmplIds], ["attribute_id.create_variant", "=", "no_variant"],
          ["ptav_active", "=", true], ["price_extra", ">", 0]],
        fields: ["id", "name", "product_tmpl_id", "price_extra"],
        limit: 5000
      });
      for (const t of ptavs) {
        const tid = m2oId(t.product_tmpl_id);
        if (!tecnicas.has(tid)) tecnicas.set(tid, []);
        tecnicas.get(tid).push({ ptav: t.id, n: String(t.name).trim(), extra: Number(t.price_extra) || 0 });
      }
    }
    // Tramos por volumen (lista de precios de Odoo, regla fija por producto): el precio ya incluye el logo.
    // Si un producto tiene tramos, su precio depende de las piezas y no se ofrecen técnicas aparte.
    const tramos = new Map();   // template -> [[piezas mínimas, precio sin IVA], ...] de menor a mayor
    if (tmplIds.length) {
      const items = await call("product.pricelist.item", "search_read", {
        domain: [["pricelist_id", "=", Number(data.config.pricelist_id) || 1], ["applied_on", "=", "1_product"],
          ["compute_price", "=", "fixed"], ["product_tmpl_id", "in", tmplIds]],
        fields: ["product_tmpl_id", "min_quantity", "fixed_price"],
        limit: 5000
      });
      for (const it of items) {
        const tid = m2oId(it.product_tmpl_id);
        if (!tramos.has(tid)) tramos.set(tid, []);
        tramos.get(tid).push([Number(it.min_quantity) || 0, r2(it.fixed_price)]);
      }
      for (const t of tramos.values()) t.sort((a, b) => a[0] - b[0]);
    }
    // Precio pieza + técnica (casilla x_precio_desglose): los tramos del producto son solo la pieza. Se ofrece una
    // opción por técnica vendible de x_tecnica_ids con los tramos ya sumados (sin IVA), y no la pieza sola, para que
    // nunca se cotice sin la técnica. Si algo falla, el producto queda con sus tramos como antes.
    const opcionesTec = new Map();   // template -> [{ s: id del servicio, n: nombre público, t: [[mín, total]] }]
    if (tmplIds.length) {
      try {
        const tmpls = await call("product.template", "search_read", {
          domain: [["id", "in", tmplIds], ["x_precio_desglose", "=", true]], fields: ["id", "x_tecnica_ids"], limit: 2000
        });
        const servIds = [...new Set(tmpls.flatMap((t) => t.x_tecnica_ids || []))];
        const servs = servIds.length ? await call("product.template", "search_read", {
          domain: [["id", "in", servIds], ["sale_ok", "=", true]], fields: ["id", "name", "description_sale", "list_price"], limit: 500
        }) : [];
        const reglas = servs.length ? await call("product.pricelist.item", "search_read", {
          domain: [["pricelist_id", "=", Number(data.config.pricelist_id) || 1], ["applied_on", "=", "1_product"],
            ["compute_price", "=", "fixed"], ["product_tmpl_id", "in", servs.map((x) => x.id)]],
          fields: ["product_tmpl_id", "min_quantity", "fixed_price"], limit: 2000
        }) : [];
        for (const t of tmpls) {
          const pieza = tramos.get(t.id) || [];
          const ops = [];
          for (const sv of servs.filter((x) => (t.x_tecnica_ids || []).includes(x.id))) {
            const rs = reglas.filter((r) => m2oId(r.product_tmpl_id) === sv.id).map((r) => [Number(r.min_quantity) || 0, r2(r.fixed_price)]);
            const tt = sumarTramos(pieza, reglasTecnica(rs, sv.list_price));
            if (tt.length) ops.push({ s: sv.id, n: nombreTecnica(sv.name, sv.description_sale), t: tt });
          }
          // Con la casilla los tramos son solo la pieza: sin técnica con precio no se ofrece (va a "revisar").
          opcionesTec.set(t.id, ops.sort((a, b) => a.t[0][1] - b.t[0][1]));
        }
      } catch (e) {
        console.error("catalogo: precio pieza + técnica no disponible: " + e.message);
        opcionesTec.clear();
      }
    }
    // Códigos de proveedor (pestaña Compra → Proveedores): solo para buscar en Cotiza y mostrarlos a Eunice.
    const prov = [];
    if (tmplIds.length) {
      prov.push(...await call("product.supplierinfo", "search_read", {
        domain: [["product_tmpl_id", "in", tmplIds], ["product_code", "!=", false]],
        fields: ["id", "partner_id", "product_id", "product_tmpl_id", "product_code"],
        limit: 5000
      }));
    }
    const provDe = indexarProveedores(prov);
    // Letras del SKU (viven en Odoo, campo x_sku_letra) para la guía de SKU, y color de cada variante.
    // Si algo de esto falla, el catálogo sigue saliendo sin tablas (la guía pide actualizar).
    const tablas = { categorias: [], colores: [] };
    const letraCat = new Map(), colorDe = new Map();   // categoría -> letra; variante -> { n, hex, l }
    try {
      const cats = await call("product.category", "search_read", { domain: [["x_sku_letra", "!=", false]], fields: ["id", "name", "x_sku_letra"], limit: 200 });
      const vals = await call("product.attribute.value", "search_read", { domain: [["attribute_id", "=", ATTR_COLOR]], fields: ["id", "name", "html_color", "x_sku_letra"], limit: 500 });
      const ptavIds = [...new Set(rows.flatMap((r) => r.product_template_attribute_value_ids || []))];
      const ptavs = ptavIds.length ? await call("product.template.attribute.value", "search_read", {
        domain: [["id", "in", ptavIds], ["attribute_id", "=", ATTR_COLOR]], fields: ["id", "product_attribute_value_id"], limit: 5000
      }) : [];
      const orden = (l) => (/\d/.test(l) ? "~" : "") + l;   // letras primero, números al final
      for (const c of cats) { const l = String(c.x_sku_letra).trim().toUpperCase(); letraCat.set(c.id, l); tablas.categorias.push({ l, n: String(c.name) }); }
      const valor = new Map();
      for (const v of vals) {
        const col = { n: String(v.name), hex: v.html_color || "" };
        if (v.x_sku_letra) { col.l = String(v.x_sku_letra).trim().toUpperCase(); tablas.colores.push({ l: col.l, n: col.n, hex: col.hex }); }
        valor.set(v.id, col);
      }
      const cmp = (a, b) => (orden(a.l) < orden(b.l) ? -1 : orden(a.l) > orden(b.l) ? 1 : 0);
      tablas.categorias.sort(cmp);
      tablas.colores.sort(cmp);
      const colPtav = new Map(ptavs.map((t) => [t.id, valor.get(m2oId(t.product_attribute_value_id))]));
      for (const r of rows) {
        const col = (r.product_template_attribute_value_ids || []).map((id) => colPtav.get(id)).find(Boolean);
        if (col) colorDe.set(r.id, col);
      }
    } catch (e) {
      console.error("catalogo: letras SKU no disponibles: " + e.message);
      tablas.categorias = []; tablas.colores = []; letraCat.clear(); colorDe.clear();
    }
    const extras = (r) => {
      const o = {};
      const cat = Array.isArray(r.categ_id) ? String(r.categ_id[1]).split(" / ").pop().trim() : "";
      if (cat) o.cat = cat;
      // SKU anterior (antes del SKU compacto): sirve para encontrar códigos viejos de WhatsApp o de cotizaciones pasadas.
      if (r.x_sku_anterior && r.x_sku_anterior !== r.default_code) o.ant = r.x_sku_anterior;
      const pv = provDe(r);
      if (pv.length) o.prov = pv;
      const l = letraCat.get(m2oId(r.categ_id));
      if (l) o.catL = l;
      const col = colorDe.get(r.id);
      if (col) o.col = col;
      return o;
    };
    const out = [], revisar = [];
    for (const r of rows) {
      if (r.default_code && skip.has(String(r.default_code).toUpperCase())) continue;
      if (r.default_code === "KK-LIBRE") continue;
      const p = Number(r.list_price) || 0, c = Number(r.standard_price) || 0;
      const nombre = String(r.display_name).replace(/^\[[^\]]+\]\s*/, "").trim();
      if (p <= 1 || (c > 0 && p / c > 20)) { revisar.push({ id: r.id, n: nombre, p, c }); continue; }
      const iva = (r.taxes_id || []).length > 0;
      const code = r.default_code || undefined;
      const ops = opcionesTec.get(m2oId(r.product_tmpl_id));
      if (ops && !ops.length) { revisar.push({ id: r.id, n: nombre, p, c, motivo: "Precio pieza + técnica sin técnica con precio de venta" }); continue; }
      if (ops) {
        const ex = extras(r);
        for (const o of ops) {
          out.push({ k: `${r.id}-tec${o.s}`, id: r.id, n: `${nombre} · ${o.n}`, p: o.t[0][1], c, iva, code, t: o.t, min: o.t[0][0] || undefined, ...ex });
        }
        continue;
      }
      const tr = tramos.get(m2oId(r.product_tmpl_id));
      if (tr && tr.length) {
        out.push({ k: String(r.id), id: r.id, n: nombre, p, c, iva, code, t: tr, min: tr[0][0] || undefined, ...extras(r) });
        continue;
      }
      const ex = extras(r);
      out.push({ k: String(r.id), id: r.id, n: nombre, p, c, iva, code, ...ex });
      for (const t of tecnicas.get(m2oId(r.product_tmpl_id)) || []) {
        out.push({ k: `${r.id}-${t.ptav}`, id: r.id, ptav: t.ptav, n: `${nombre} · ${t.n}`,
          p: r2(p + t.extra), c: r2(c + t.extra / (1 + MARKUP_PERSONALIZACION)), iva, code, ...ex });   // se encuentra por el SKU de su base
      }
    }
    return json({ productos: out, revisar, tablas, at: new Date().toISOString() });
  } catch (e) {
    return fail(e.message, 502);
  }
}
