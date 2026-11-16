// Pruebas del buscador del selector (public/js/catalog.js), sin servidor.
// Uso: npm run test:catalog
import { clave, enrich, filter } from "../public/js/catalog.js";

let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("   ", JSON.stringify(extra)); } };

const catalogo = enrich([
  { id: 1, n: "Bolígrafo Basic tinta azul (Negro)", code: "KU-PLU-1115A-NEG", cat: "Promocionales", prov: [{ n: "Geek Promocionales", code: "A090744" }] },
  { id: 2, n: "Bolígrafo Basic tinta azul (Rojo)", code: "KU-PLU-1115A-ROJ" },
  { id: 3, n: "Playera Gildan. Negro. 100% Algodón" }
]);
const ids = (t, sel = {}) => filter(catalogo, sel, t).map((p) => p.id).join(",");

ok(clave(" ku-plu-1115a-neg ") === "KUPLU1115ANEG", "clave: quita guiones, espacios y minúsculas", clave(" ku-plu-1115a-neg "));
ok(ids("  ku-plu-1115a-neg ") === "1", "SKU completo pegado de WhatsApp", ids("  ku-plu-1115a-neg "));
ok(ids("KUPLU1115ANEG") === "1", "SKU sin guiones", ids("KUPLU1115ANEG"));
ok(ids("1115a") === "1,2", "pedazo del SKU: todas las variantes del modelo", ids("1115a"));
ok(ids("A090744") === "1", "código de proveedor", ids("A090744"));
ok(ids("promocionales") === "1", "categoría", ids("promocionales"));
ok(ids("negro") === "1,3", "nombre como hoy", ids("negro"));
ok(ids("az") === "1,2", "texto corto busca por nombre, no por clave", ids("az"));
ok(ids("") === "1,2,3", "sin texto: todos", ids(""));

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
