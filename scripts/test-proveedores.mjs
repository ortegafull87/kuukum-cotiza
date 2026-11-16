// Pruebas de lib/proveedores.js, sin servidor. Uso: npm run test:proveedores
import { indexarProveedores } from "../lib/proveedores.js";

let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("   ", JSON.stringify(extra)); } };

const provDe = indexarProveedores([
  { id: 2, partner_id: [166, "Cromografic"], product_id: false, product_tmpl_id: [11, "Gorra"], product_code: "1115A" },
  { id: 1, partner_id: [83, "Geek"], product_id: [11, "Gorra Negra"], product_tmpl_id: [11, "Gorra"], product_code: "A090744" },
  { id: 3, partner_id: [83, "Geek"], product_id: [12, "Gorra Roja"], product_tmpl_id: [11, "Gorra"], product_code: "A090748" },
  { id: 4, partner_id: [83, "Geek"], product_id: false, product_tmpl_id: [11, "Gorra"], product_code: "1115A" }
]);
ok(JSON.stringify(provDe({ id: 11, product_tmpl_id: [11, "Gorra"] })) === JSON.stringify([{ n: "Geek", code: "A090744" }, { n: "Cromografic", code: "1115A" }]),
  "variante: su código y los del producto, en orden de id y sin repetir", provDe({ id: 11, product_tmpl_id: [11, "Gorra"] }));
ok(JSON.stringify(provDe({ id: 12, product_tmpl_id: [11, "Gorra"] }).map((x) => x.code)) === JSON.stringify(["1115A", "A090748"]),
  "otra variante del mismo producto no recibe el código de su hermana");
ok(provDe({ id: 99, product_tmpl_id: [50, "Otro"] }).length === 0, "producto sin proveedores: lista vacía");

// Catálogo grande: 2000 variantes y 5000 filas de proveedor deben resolverse rápido (límite de CPU de Cloudflare).
const filas = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, partner_id: [83, "Geek"], product_id: [i % 2000 + 1, ""], product_tmpl_id: [Math.floor((i % 2000) / 4) + 1, ""], product_code: "C" + i }));
const t0 = performance.now();
const idx = indexarProveedores(filas);
let total = 0;
for (let v = 1; v <= 2000; v++) total += idx({ id: v, product_tmpl_id: [Math.floor((v - 1) / 4) + 1, ""] }).length;
const ms = performance.now() - t0;
ok(total === 5000 && ms < 30, `2000 variantes × 5000 filas en ${ms.toFixed(1)} ms (< 30 ms)`, { total });

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
