// Prueba de pantalla (no va al repo): guía de SKU y proveedores en la Ficha.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { makeSession } from "/home/claude/cotiza/lib/core.js";

const APP = "http://localhost:8788";
const token = await makeSession({ SESSION_SECRET: "dev" }, "prueba@ejemplo.mx", "Prueba");
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "kk_session", value: token, url: APP }]);
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
await ctx.addInitScript(() => { try { if (!localStorage.getItem("kk_tours")) localStorage.setItem("kk_tours", JSON.stringify(["0.4.14-ficha-rangos", "0.4.6-margen", "0.4.20-buscador-sku"])); } catch {} });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
const w = (ms = 300) => page.waitForTimeout(ms);

await page.goto(APP + "/#/nueva"); await w(2500);
await page.fill("#cq", "Scouts"); await w();
await page.locator('[data-act="pickClient"]').first().click(); await w();
if (!(await page.locator('[data-act="openSheet"]').count())) { await page.locator('[data-act="step"]').last().click(); await w(500); }

// 1. Desde el selector: tocar el SKU abre la guía y no elige el producto
await page.locator('[data-act="openSheet"]').first().click(); await page.waitForSelector("#sq");
await page.fill("#sq", "gorra"); await w();
await page.locator(".res .res-sku").first().click(); await w();
ok(await page.locator(".guia-panel").isVisible(), "selector: tocar el SKU abre la guía");
ok(await page.locator(".res.on").count() === 0, "selector: tocar el SKU no elige el producto");
const cajas = await page.locator(".guia .guia-caja b").allInnerTexts();
ok(cajas.join("|") === "KU|GOR|A2148|NEG", "guía: código desarmado en cajitas " + JSON.stringify(cajas));
const txt = await page.locator(".guia").innerText();
ok(/Promocionales/.test(txt) && /Negro/.test(txt) && /Modelo del proveedor/.test(txt), "guía: dice qué es cada parte");
ok(await page.locator('.guia .guia-tabla tr.on').count() >= 1, "guía: resalta la letra en las tablas");
ok(await page.locator(".guia .circ").count() >= 3, "guía: circulitos de color");
await page.screenshot({ path: "/tmp/ui-guia.png" });
await page.locator('.guia-panel [data-act="cerrarGuia"]').click(); await w();
ok(!(await page.locator(".guia").count()) && (await page.inputValue("#sq")) === "gorra", "cerrar la guía deja el selector con la misma búsqueda");

// 2. Ficha: SKU tocable y proveedores con código para copiar
await page.locator('.res', { hasText: "Gorra" }).first().click(); await w();
await page.locator('[data-act="addPicked"]').click(); await w(500);
await page.locator(".line .info-btn").first().click(); await w(800);
const ficha = await page.locator(".sheet").innerText();
ok(/Proveedores/i.test(ficha) && /Geek Promocionales/.test(ficha) && /A090744/.test(ficha) && /Cromografic/.test(ficha), "Ficha: proveedores con su código");
await page.screenshot({ path: "/tmp/ui-ficha.png" });
await page.locator('.sheet [data-act="copiarCodigo"]').first().click(); await w();
ok((await page.evaluate(() => navigator.clipboard.readText())) === "A090744", "Ficha: copiar el código del proveedor");
await page.locator('.sheet [data-act="guiaSku"]').first().click(); await w();
ok(await page.locator(".guia-panel").isVisible(), "Ficha: tocar el SKU abre la guía");
await page.locator('.guia-panel [data-act="cerrarGuia"]').click(); await w();

// 3. Ajustes: guía sin SKU (solo tablas)
await page.goto(APP + "/#/ajustes"); await w(1800);
ok(await page.locator(".driver-popover").filter({ hasText: "Guía de SKU" }).count() === 1, "recorrido: sale una vez en Ajustes");
await page.screenshot({ path: "/tmp/ui-tour-guia.png" });
await page.keyboard.press("Escape"); await w(400);
await page.reload(); await w(1800);
ok(await page.locator(".driver-popover").count() === 0, "recorrido: ya no vuelve a salir");
await page.locator('#btn-guia-sku').click(); await w();
ok(await page.locator(".guia-panel").isVisible() && !(await page.locator(".guia .guia-caja").count()) && await page.locator(".guia .guia-tabla").count() === 2, "Ajustes: la guía muestra solo las tablas");
await page.screenshot({ path: "/tmp/ui-guia-ajustes.png" });

ok(errs.length === 0, "sin errores de JavaScript " + JSON.stringify(errs));
await browser.close();
process.exit(fails ? 1 : 0);
