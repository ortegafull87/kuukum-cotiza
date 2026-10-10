// Falla (exit 1) si la versión no coincide en todos los lugares: public/version.json, APP_VERSION de app.js,
// VERSION de sw.js y los ?v= de index.html y de los import entre módulos. Si no coinciden, la app instalada no se
// entera de la versión nueva o mezcla archivos de dos versiones (pantalla oscura de la 0.3.2).
// Uso: node scripts/check-version.mjs   (corre solo antes de `npm run deploy`; úsalo también como build command en Cloudflare)
// Para corregir: node scripts/bump-version.mjs X.Y.Z
import { readFileSync, readdirSync } from "node:fs";

const file = (p) => new URL("../public/" + p, import.meta.url);
const read = (p) => readFileSync(file(p), "utf8");
const errores = [];

let version;
try { version = JSON.parse(read("version.json")).version; } catch (e) { errores.push(`public/version.json no se pudo leer: ${e.message}`); }
if (version && !/^\d+\.\d+\.\d+$/.test(version)) errores.push(`public/version.json: "${version}" no es X.Y.Z`);

const una = (path, re, nombre) => {
  const m = read(path).match(re);
  if (!m) errores.push(`public/${path}: no encontré ${nombre}`);
  else if (m[1] !== version) errores.push(`public/${path}: ${nombre} = ${m[1]} (version.json = ${version})`);
};
una("js/app.js", /const APP_VERSION = "([^"]+)";/, "APP_VERSION");
una("sw.js", /const VERSION = "([^"]+)";/, "VERSION");

for (const path of ["index.html", ...readdirSync(file("js/")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f)]) {
  const malos = [...read(path).matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map((m) => m[1]).filter((v) => v !== version);
  if (malos.length) errores.push(`public/${path}: ${malos.length} ?v= con otra versión (${[...new Set(malos)].join(", ")})`);
}

if (errores.length) {
  console.error(`✗ Versión desalineada:\n  - ${errores.join("\n  - ")}\n  Corrige con: node scripts/bump-version.mjs ${version || "X.Y.Z"}`);
  process.exit(1);
}
console.log(`✓ Versión ${version} alineada (version.json, app.js, sw.js y ?v=)`);
