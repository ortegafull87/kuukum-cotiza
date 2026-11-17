// Pruebas del buscador del selector (public/js/catalog.js), sin servidor.
// Uso: npm run test:catalog
import { clave, enrich, filter } from "../public/js/catalog.js";

let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("   ", JSON.stringify(extra)); } };

const catalogo = enrich([
  { id: 1, n: "Bolígrafo Basic tinta azul (Negro)", code: "KU-PLU-1115A-NEG", cat: "Promocionales", prov: [{ n: "Geek Promocionales", code: "A090744" }] },
  { id: 2, n: "Bolígrafo Basic tinta azul (Rojo)", code: "KU-PLU-1115A-ROJ" },
  { id: 3, n: "Playera Gildan. Negro. 100% Algodón" },
  { id: 4, n: "Bolígrafo Basic tinta azul (Negro mate)", code: "KU-PLU-1115A-NEGM" },
  { id: 1, ptav: 90, n: "Bolígrafo Basic tinta azul (Negro) · Láser", code: "KU-PLU-1115A-NEG" }
]);
const ids = (t, sel = {}) => filter(catalogo, sel, t).map((p) => p.id).join(",");

ok(clave(" ku-plu-1115a-neg ") === "KUPLU1115ANEG", "clave: quita guiones, espacios y minúsculas", clave(" ku-plu-1115a-neg "));
ok(ids("  ku-plu-1115a-neg ") === "1,1", "SKU completo pegado de WhatsApp: solo ese producto y su opción con técnica", ids("  ku-plu-1115a-neg "));
ok(ids("KUPLU1115ANEG") === "1,1", "SKU sin guiones: no trae otro SKU que solo lo contiene (NEGM)", ids("KUPLU1115ANEG"));
ok(ids("1115a") === "1,2,4,1", "pedazo del SKU: todas las variantes del modelo", ids("1115a"));
ok(ids("A090744") === "1", "código de proveedor", ids("A090744"));
ok(ids("promocionales") === "1", "categoría", ids("promocionales"));
ok(ids("negro") === "1,3,4,1", "nombre como hoy", ids("negro"));
ok(ids("az") === "1,2,4,1", "texto corto busca por nombre, no por clave", ids("az"));
ok(ids("") === "1,2,3,4,1", "sin texto: todos", ids(""));

// Después del SKU compacto: el código viejo (WhatsApp o cotización pasada) sigue encontrando el producto.
const migrado = enrich([{ id: 7, n: "Bolígrafo Basic tinta azul (Negro)", code: "KP001N", ant: "KU-PLU-1115A-NEG" }, { id: 8, n: "Bocina", code: "KT085B", ant: "KU-TEC-TEC179-NEG" }]);
const idsM = (t) => filter(migrado, {}, t).map((p) => p.id).join(",");
ok(idsM("KU-PLU-1115A-NEG") === "7", "SKU anterior completo: encuentra el producto renombrado", idsM("KU-PLU-1115A-NEG"));
ok(idsM("kp001n") === "7", "SKU compacto en minúsculas", idsM("kp001n"));
ok(idsM("KT085B") === "8", "SKU compacto exacto", idsM("KT085B"));

// Botón "ver en la tienda": candidatos de SKU padre en la tienda.
const { candidatosTienda } = await import("../functions/api/tienda.js");
const ct = candidatosTienda("KP001N", "KU-PLU-1115A-NEG");
ok(JSON.stringify(ct) === JSON.stringify(["KP001", "KP001N", "KU-PLU-1115A", "KU-PLU-1115A-NEG"]), "tienda: padre compacto primero y luego el anterior", ct);
ok(JSON.stringify(candidatosTienda("KV001")) === JSON.stringify(["KV001"]), "tienda: producto sin color", candidatosTienda("KV001"));

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
