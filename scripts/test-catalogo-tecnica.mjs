// Prueba de /api/catalogo con precio pieza + técnica (x_precio_desglose), con Odoo simulado en memoria (fetch falso).
// Uso: npm run test:precios
import { onRequestGet } from "../functions/api/catalogo.js";

let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + " → " + JSON.stringify(a));

const PEN = 412, LASER = 589, SERI = 591;
const db = {
  "product.product": [
    { id: 662, display_name: "[KP003P] Bolígrafo Láser (Plateado)", default_code: "KP003P", list_price: 78.59, standard_price: 60.15, taxes_id: [14], product_tmpl_id: [PEN, "Bolígrafo Láser"], categ_id: [16, "Bolígrafos"], product_template_attribute_value_ids: [], sale_ok: true, active: true },
    { id: 701, display_name: "[KP009N] Bolígrafo Sin Técnica (Negro)", default_code: "KP009N", list_price: 20, standard_price: 9, taxes_id: [14], product_tmpl_id: [401, "Bolígrafo Sin Técnica"], categ_id: [16, "Bolígrafos"], product_template_attribute_value_ids: [], sale_ok: true, active: true },
    { id: 702, display_name: "[KP010N] Bolígrafo Serigrafía (Negro)", default_code: "KP010N", list_price: 8, standard_price: 5, taxes_id: [14], product_tmpl_id: [402, "Bolígrafo Serigrafía"], categ_id: [16, "Bolígrafos"], product_template_attribute_value_ids: [], sale_ok: true, active: true },
    { id: 703, display_name: "[KP011N] Bolígrafo Dos Técnicas (Negro)", default_code: "KP011N", list_price: 8, standard_price: 5, taxes_id: [14], product_tmpl_id: [403, "Bolígrafo Dos Técnicas"], categ_id: [16, "Bolígrafos"], product_template_attribute_value_ids: [], sale_ok: true, active: true },
    { id: 700, display_name: "[KP001N] Bolígrafo Basic (Negro)", default_code: "KP001N", list_price: 10, standard_price: 6, taxes_id: [14], product_tmpl_id: [400, "Bolígrafo Basic"], categ_id: [16, "Bolígrafos"], product_template_attribute_value_ids: [], sale_ok: true, active: true }
  ],
  "product.template": [
    { id: PEN, x_precio_desglose: true, x_tecnica_ids: [LASER, SERI] },
    { id: 400, x_precio_desglose: false, x_tecnica_ids: [LASER] },
    { id: 401, x_precio_desglose: true, x_tecnica_ids: [SERI] },
    { id: 402, x_precio_desglose: true, x_tecnica_ids: [592] },
    { id: 403, x_precio_desglose: true, x_tecnica_ids: [LASER, 592] },
    { id: 592, name: "Personalización · Serigrafía 2 tintas", description_sale: false, list_price: 9, sale_ok: true },
    { id: LASER, name: "Personalización · Grabado láser chico (hasta 5×5 cm)", description_sale: "Grabado láser", list_price: 16.67, sale_ok: true },
    { id: SERI, name: "Personalización · Serigrafía 1 tinta", description_sale: false, list_price: 9, sale_ok: false }
  ],
  "product.pricelist.item": [
    ...[[5, 78.59], [10, 73.42], [30, 69.11], [50, 64.80], [100, 61.61]].map(([m, p]) => ({ product_tmpl_id: [PEN, ""], min_quantity: m, fixed_price: p })),
    { product_tmpl_id: [400, ""], min_quantity: 50, fixed_price: 10 },
    { product_tmpl_id: [401, ""], min_quantity: 5, fixed_price: 20 },
    { product_tmpl_id: [402, ""], min_quantity: 5, fixed_price: 8 },
    { product_tmpl_id: [403, ""], min_quantity: 5, fixed_price: 8 },
    { product_tmpl_id: [592, ""], min_quantity: 100, fixed_price: 4 },
    { product_tmpl_id: [LASER, ""], min_quantity: 1, fixed_price: 16.67 },
    { product_tmpl_id: [LASER, ""], min_quantity: 100, fixed_price: 15.98 }
  ]
};
const cumple = (r, d) => d.every(([f, op, v]) => {
  if (["pricelist_id", "applied_on", "compute_price"].includes(f)) return true;
  const x = Array.isArray(r[f]) ? r[f][0] : r[f];
  return op === "=" ? x === v : op === "in" ? v.includes(x) : op === "!=" ? x !== v : true;
});
let fallar = false;
globalThis.fetch = async (url, o) => {
  const [model, method] = url.split("/json/2/")[1].split("/");
  const { domain = [] } = JSON.parse(o.body);
  if (fallar && model === "product.template") return new Response('{"message":"falla simulada"}', { status: 500 });
  const rows = method === "search_read" ? (db[model] || []).filter((r) => cumple(r, domain)) : [];
  return new Response(JSON.stringify(rows), { status: 200 });
};
const pedir = async () => (await (await onRequestGet({ env: { ODOO_URL: "http://odoo" }, data: { config: { pricelist_id: 1 }, log: null } })).json()).productos;

let prods = await pedir();
const pen = prods.filter((p) => p.id === 662);
eq(pen.map((p) => p.n), ["Bolígrafo Láser (Plateado) · Grabado láser"], "una opción por técnica vendible; sin la pieza sola ni la técnica sin Ventas");
eq(pen[0].t, [[5, 95.26], [10, 90.09], [30, 85.78], [50, 81.47], [100, 77.59]], "tramos sumados sin IVA");
ok(pen[0].p === 95.26 && pen[0].min === 5 && pen[0].c === 60.15 && pen[0].k === "662-tec589", "precio, mínimo, costo y clave");
eq(prods.filter((p) => p.id === 700).map((p) => p.t), [[[50, 10]]], "producto sin la casilla: igual que antes");
eq(prods.filter((p) => p.id === 702).map((p) => p.t), [[[5, 17], [100, 12]]], "I1: debajo de la primera regla de la técnica se suma su precio de venta (9)");
eq(prods.filter((p) => p.id === 703).map((p) => p.n.split(" · ")[1]), ["Grabado láser", "Serigrafía 2 tintas"], "orden de las técnicas como en Odoo (no la más barata)");
let todo = await (await onRequestGet({ env: { ODOO_URL: "http://odoo" }, data: { config: { pricelist_id: 1 }, log: null } })).json();
ok(!todo.productos.some((p) => p.id === 701) && todo.revisar.some((r) => r.id === 701), "I2: con la casilla y sin técnica vendible no se ofrece (va a revisar)");

fallar = true;
prods = await pedir();
eq(prods.filter((p) => p.id === 662).map((p) => p.t[0]), [[5, 78.59]], "si falla la lectura, se queda con sus tramos");

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
