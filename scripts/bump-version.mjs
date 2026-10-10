// Cambia la versión en los tres lugares que deben coincidir: public/version.json, APP_VERSION de app.js y CACHE de sw.js.
// Uso: node scripts/bump-version.mjs            -> sube el último número (0.3.0 -> 0.3.1)
//      node scripts/bump-version.mjs minor      -> 0.3.0 -> 0.4.0
//      node scripts/bump-version.mjs 1.0.0      -> versión exacta
import { readFileSync, writeFileSync } from "node:fs";

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
replace("sw.js", /const CACHE = "kuukum-cotiza-[^"]+";/, `const CACHE = "kuukum-cotiza-${nueva}";`);
console.log(`${actual} -> ${nueva}`);
