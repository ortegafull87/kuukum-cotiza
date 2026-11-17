// Prueba de pantalla de la cotización comparativa (Playwright). Local: requiere Chrome, Playwright, el Odoo simulado en :8069
// y el servidor con ALLOWED_EMAILS=prueba@ejemplo.mx; ajusta las rutas de import (como en guia.mjs).
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { makeSession } from "/home/claude/kuukum-cotiza/lib/core.js";
const APP = "http://localhost:8788";
const token = await makeSession({ SESSION_SECRET: "dev" }, "prueba@ejemplo.mx", "Prueba");
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-proxy-server"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "kk_session", value: token, url: APP }]);
await ctx.addInitScript(() => { try { if (!localStorage.getItem("kk_tours")) localStorage.setItem("kk_tours", JSON.stringify(["0.4.25-comparativa","0.4.24-mismo-producto","0.4.21-guia-sku","0.4.20-buscador-sku","0.4.14-ficha-rangos","0.4.6-margen"])); } catch {} });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
let fails = 0; const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
const w = (ms = 350) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `/tmp/${n}.png` });
async function agrega(q) {
  await page.locator('[data-act="openSheet"]').first().click(); await page.waitForSelector("#sq");
  await page.fill("#sq", "gorra"); await w();
  await page.locator('[data-act="pickProd"]').first().click(); await w();
  await page.fill("#sheetq", String(q)); await page.dispatchEvent("#sheetq", "input"); await w(150);
  await page.locator('[data-act="addPicked"]').click(); await w(500);
}
const lineas = () => page.locator(".line").count();

await page.goto(APP + "/#/nueva"); await w(2500);
await page.fill("#cq", "Scouts"); await w();
await page.locator('[data-act="pickClient"]').first().click(); await w();
if (!(await page.locator('[data-act="openSheet"]').count())) { await page.locator('[data-act="step"]').last().click(); await w(500); }

await agrega(20);
ok(!(await page.locator('[data-act="compSi"]').count()), "primer producto: sin ventana");
await agrega(50);
ok(await page.locator('[data-act="compSi"]').count() === 1, "mismo producto: sale la ventana de comparativa");
await shot("1-ventana");
await page.locator('[data-act="compError"]').click(); await w();
ok(await lineas() === 1, "«Fue un error» quita el renglón");
await agrega(50);
await page.locator('[data-act="compSi"]').click(); await w();
ok(await lineas() === 2, "«Sí» deja los dos renglones");
await agrega(100);
ok(!(await page.locator('[data-act="compSi"]').count()), "ya comparativa: no vuelve a preguntar");
ok(await lineas() === 3, "tres renglones");

// paso 3
await page.locator('[data-act="step"]').last().click(); await w(600);
if (await page.locator('[data-act="arteNo"]').count()) { await page.locator('[data-act="arteNo"]').click(); await w(600); }
ok(await page.locator("#comparativa").isChecked(), "paso 3: interruptor activado");
ok((await page.locator("#mini3").innerText()).includes("con IVA"), "paso 3: opciones con IVA en lugar de total");
await page.locator("#comparativa").scrollIntoViewIfNeeded(); await shot("2-paso3");
// paso 4
await page.locator('[data-act="step"]').last().click(); await w(800);
const p4 = await page.locator(".content, main").first().innerText();
ok(!/pago requerido/i.test(p4) && /opciones/i.test(p4), "paso 4: opciones y sin pago requerido");
await page.waitForSelector("#savebtn:not([disabled])", { timeout: 8000 });
await shot("3-paso4");
await page.locator("#savebtn").click(); await w(2500);
const det = await page.locator("main").innerText();
ok(det.includes("Convertir en formal") && /opciones/i.test(det), "detalle: opciones y botón Convertir en formal");
await shot("4-detalle");
const st = await (await fetch("http://localhost:8069/__state")).json();
const so = st["sale.order"].at(-1);
ok(st["crm.tag"].some((t) => t.name === "Comparativa") && so.tag_ids.length === 1, "Odoo: presupuesto con etiqueta Comparativa");
// lista
await page.goto(APP + "/#/cotizaciones"); await w(1200);
ok((await page.locator("#qlist").innerText()).includes("Comparativa · 3 opciones"), "lista: «Comparativa · 3 opciones»");
await shot("5-lista");
await page.locator(".qcard").first().click(); await w(800);
// convertir
await page.locator('[data-act="conv"]').click(); await w();
await shot("6-convertir");
await page.locator('[data-act="convertir"]').click(); await w();
ok(await page.locator('[data-act="convertir"]').count() === 1, "sin elegir no convierte");
await page.locator("[data-conv]").nth(1).check(); await page.locator('[data-act="convertir"]').click(); await w(1200);
ok(!(await page.locator("#comparativa").isChecked()), "formal: interruptor apagado");
ok(!(await page.locator("#mini3").innerText()).includes("con IVA") && (await page.locator("#mini3").innerText()).includes("Total"), "formal: con total");
await page.locator('[data-act="step"]').last().click(); await w(800);
await page.waitForSelector("#savebtn:not([disabled])", { timeout: 8000 });
await page.locator("#savebtn").click(); await w(2500);
const st2 = await (await fetch("http://localhost:8069/__state")).json();
const so2 = st2["sale.order"].find((o) => o.id === so.id);
const lines = st2["sale.order.line"].filter((l) => l.order_id === so.id);
ok(so2.tag_ids.length === 0 && lines.length === 1 && lines[0].product_uom_qty === 50, `Odoo: R2 sin etiqueta y solo la opción de 50 (${lines.map((l) => l.product_uom_qty)})`);
await shot("7-formal");
ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
await browser.close();
console.log(fails ? `${fails} fallas` : "Todas pasaron");
