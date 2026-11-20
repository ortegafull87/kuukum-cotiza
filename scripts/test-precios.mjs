// Pruebas de precio pieza + técnica (lib/precios.js), sin servidor. Uso: npm run test:precios
// Mismo contrato que geek-sync/precios.js: los totales de la tienda y de Cotiza salen de la misma suma.
import { sumarTramos, nombreTecnica } from "../lib/precios.js";

let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + " → " + JSON.stringify(a));

eq(sumarTramos([[5, 78.59], [10, 73.42], [30, 69.11], [50, 64.80], [100, 61.61]], [[1, 16.67], [100, 15.98]]),
  [[5, 95.26], [10, 90.09], [30, 85.78], [50, 81.47], [100, 77.59]], "POC Bolígrafo Láser");
eq(sumarTramos([[50, 10], [100, 9]], [[1, 2], [250, 1]]), [[50, 12], [100, 11], [250, 10]], "corte de técnica mayor se vuelve corte");
eq(sumarTramos([[5, 10]], []), [], "sin técnica no hay suma");
eq(sumarTramos([], [[1, 2]]), [], "sin pieza no hay suma");
eq(sumarTramos([[10, 5], [5, 6]], [[1, 1]]), [[5, 7], [10, 6]], "rangos desordenados");
eq(nombreTecnica("Personalización · Grabado láser chico (hasta 5×5 cm)", false), "Grabado láser chico", "nombre sin descripción");
eq(nombreTecnica("Personalización · Grabado láser chico (hasta 5×5 cm)", "Grabado láser\notra línea"), "Grabado láser", "descripción manda");

if (fails) { console.log(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas pasaron");
