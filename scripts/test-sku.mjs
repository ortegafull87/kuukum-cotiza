// Pruebas de public/js/sku.js, sin servidor. Uso: npm run test:sku
import { desarmarSku } from "../public/js/sku.js";

let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("   ", JSON.stringify(extra)); } };

const tablas = { categorias: [{ l: "P", n: "Plumas" }, { l: "K", n: "Sets corporativos" }], colores: [{ l: "N", n: "Negro", hex: "#1A1A1A" }] };
const txt = (r) => r.partes.map((p) => p.txt).join("|");

const a = desarmarSku("KP004N", tablas);
ok(a.formato === "nuevo" && txt(a) === "K|P|004|N", "nuevo: K · P · 004 · N", a);
ok(a.partes[0].nombre === "Kuu Kum" && a.partes[1].nombre === "Plumas" && a.partes[2].nombre === "Modelo 4" && a.partes[3].nombre === "Negro" && a.partes[3].hex === "#1A1A1A", "nuevo: nombres y circulito", a);
ok(a.partes.map((p) => p.que).join(",") === "marca,categoria,modelo,color", "nuevo: qué es cada parte", a);
ok(desarmarSku(" kp004n ", tablas).formato === "nuevo", "nuevo: minúsculas y espacios");
const s = desarmarSku("KK001", tablas);
ok(s.formato === "nuevo" && s.partes.length === 3 && s.partes[1].nombre === "Sets corporativos", "nuevo sin color: 5 caracteres", s);
const b = desarmarSku("KU-PLU-1115A-NEG", tablas, { cat: "Plumas", col: { n: "Negro", hex: "#1A1A1A" } });
ok(b.formato === "anterior" && txt(b) === "KU|PLU|1115A|NEG" && b.partes[1].nombre === "Plumas" && b.partes[2].nombre === "Modelo del proveedor" && b.partes[3].nombre === "Negro" && b.partes[3].hex === "#1A1A1A", "anterior: con categoría y color del producto", b);
ok(desarmarSku("KU-KIT-BAMBU", tablas, { cat: "Sets corporativos" }).partes.length === 3, "anterior sin color");
ok(desarmarSku("KP004Z", tablas).partes[3].nombre === "Color no registrado", "letra de color que no está en Odoo");
ok(desarmarSku("KQ004N", tablas).partes[1].nombre === "Categoría no registrada", "letra de categoría que no está en Odoo");
ok(desarmarSku("KO004N", tablas).formato === "otro" && desarmarSku("KI004N", tablas).formato === "otro", "I y O no son categorías válidas");
ok(desarmarSku("KK-LIBRE", tablas).formato === "otro" && desarmarSku("", tablas).formato === "otro" && desarmarSku(undefined, tablas).formato === "otro", "otros códigos");
ok(desarmarSku("KP004N", undefined).partes[1].nombre === "", "sin tablas no truena");

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
