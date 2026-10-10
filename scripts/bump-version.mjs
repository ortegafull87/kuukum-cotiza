// Cambia la versión en todos los lugares que deben coincidir: public/version.json, APP_VERSION de app.js, VERSION de sw.js
// y los ?v= de index.html y de los import entre módulos (para que el navegador nunca mezcle archivos de dos versiones).
// Uso: node scripts/bump-version.mjs            -> sube el último número (0.3.0 -> 0.3.1)
//      node scripts/bump-version.mjs minor      -> 0.3.0 -> 0.4.0
//      node scripts/bump-version.mjs 1.0.0      -> versión exacta
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const root = new URL("../public/", import.meta.url);
const file = (p) => new URL(p, root);
const actual = JSON.parse(readFileSync(file("version.json"), "utf8")).version;
const arg = process.argv[2] || "patch";
let [ma, mi, pa] = actual.split(".").map(Number);
const nueva = /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : arg === "major" ? `${ma + 1}.0.0` : arg === "minor" ? `${ma}.${mi + 1}.0` : arg === "patch" ? `${ma}.${mi}.${pa + 1}` : null;
if (!nueva) { console.error("Uso: bump-version.mjs [patch|minor|major|X.Y.Z]"); process.exit(1); }

function replace(path, re, to) {
  const src = readFileSync(file(path), "utf8");
  if (!re.test(src)) { console.error(`No encontré la versión en public/${path}`); process.exit(1); }
  writeFileSync(file(path), src.replace(re, to));
}
writeFileSync(file("version.json"), JSON.stringify({ version: nueva }, null, 1).replace(/\n\s*/g, " ") + "\n");
replace("js/app.js", /const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${nueva}";`);
replace("sw.js", /const VERSION = "[^"]+";/, `const VERSION = "${nueva}";`);
// ?v= de index.html y de los import entre módulos: todas las URLs cambian juntas.
for (const path of ["index.html", ...readdirSync(file("js/")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f)]) {
  const src = readFileSync(file(path), "utf8");
  const out = src.replace(/\?v=\d+\.\d+\.\d+/g, "?v=" + nueva);
  if (out !== src) writeFileSync(file(path), out);
}
console.log(`${actual} -> ${nueva}`);
