// Prueba e2e de la API contra wrangler + Odoo simulado (ver README, "Pruebas locales").
// Uso: node scripts/e2e.mjs [http://localhost:8788] [http://localhost:8069] [archivo con la salida de wrangler]
import { makeSession, sealFor } from "../lib/core.js";
import { calc } from "../public/js/calc.js";
import { canonical } from "../public/js/canonical.js";
import { parseQr } from "../public/js/scanner.js";
import { qrText } from "../public/js/pdf.js";

const APP = process.argv[2] || "http://localhost:8788";
const ODOO = process.argv[3] || "http://localhost:8069";
const WRANGLER_LOG = process.argv[4] || "";
const env = { SESSION_SECRET: "dev", SEAL_SECRET: "dev" };
const EMAIL = "ortegafull87@gmail.com";
const cookie = "kk_session=" + await makeSession(env, EMAIL, "Victor");

let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("   ", JSON.stringify(extra).slice(0, 600)); } };
async function api(path, body, ck = cookie) {
  const r = await fetch(APP + "/api/" + path, {
    method: body ? "POST" : "GET", headers: { cookie: ck, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: await r.json().catch(() => null), rid: r.headers.get("x-request-id") };
}
const state = async () => (await fetch(ODOO + "/__state")).json();
const setOdoo = (model, id, vals) => fetch(ODOO + "/__set", { method: "POST", body: JSON.stringify({ model, id, vals }) });
const order = async (id) => (await state())["sale.order"].find((o) => o.id === id);
const run = Date.now().toString(36);

async function quote(over = {}) {
  const q = {
    uuid: crypto.randomUUID(), folio: "KK-V" + String(Math.floor(Math.random() * 9000) + 1000), fecha: new Date().toISOString(), creadoPor: EMAIL,
    cliente: { odooId: 1, nombre: "Grupo Scouts 12", tel: "442 111 2222", email: "ana@scouts12.mx" }, canal: "WA",
    items: [{ productId: 10, n: "Playera Unisex", q: 10, p: 180, c: 90 }], desc: 0, iva: false,
    anticipoPct: 60, entrega: "5 a 7 días hábiles", vigencia: 15, notas: "", estado: "guardada", enviada: false, ...over
  };
  q.sello = await sealFor(env, EMAIL, q, calc(q));
  return q;
}

// 0. kk-v1 sin cambios: el canónico de rev 1 es idéntico al formato original.
{
  const q = await quote();
  const t = calc(q);
  const v1 = ["kk-v1", q.folio, q.fecha.slice(0, 10), q.cliente.nombre, "4421112222", "10|180.00|Playera Unisex", "desc:0", "iva:0",
    `total:${t.total.toFixed(2)}`, `anticipo:${t.anticipo.toFixed(2)}`].join("\n");
  ok(canonical(q, t) === v1, "rev 1 sigue usando kk-v1 idéntico");
  ok(canonical({ ...q, rev: 2 }, t) === v1.replace("kk-v1", "kk-v2") + "\nrev:2", "rev 2 usa kk-v2 = kk-v1 + rev:N");
}

// 0b. QR de texto plano (v0.3) y compatibilidad con la URL vieja
{
  const t = qrText({ folio: "KK-L0012", rev: 2, sello: "7F3A9C214B8ED015" });
  ok(t === "KUUKUM|V1|KK-L0012-R2|7F3A9C214B8ED015" && !/https?:/.test(t), "QR nuevo: texto KUUKUM|V1|folio-Rn|sello, sin enlace", t);
  ok(JSON.stringify(parseQr(t)) === JSON.stringify({ folio: "KK-L0012-R2", sello: "7F3A9C214B8ED015" }), "lector: formato nuevo");
  ok(parseQr("https://cotiza.kuukum.mx/#/verificar/KK-L0012/7F3A9C214B8ED015")?.sello === "7F3A9C214B8ED015", "lector: URL vieja");
  ok(parseQr("https://otra-cosa.com/promo") === null && parseQr("KUUKUM|V1|KK-L1|CORTO") === null, "lector: rechaza códigos ajenos o mal formados");
}

// 1. Clientes cautivos
{
  const { status, data } = await api("clientes");
  const by = (id) => data.clientes.find((c) => c.id === id);
  ok(status === 200, "GET /api/clientes");
  ok(by(1) && by(1).ventas >= 1 && by(1).cautivo === true, "Scouts 12: venta de contacto hijo cuenta, es cautivo", by(1));
  ok(by(3) && by(3).cautivo === false, "Cliente sin compras no es cautivo", by(3));
  ok(by(4) && by(4).ventas === 1 && by(4).cautivo === false, "Con compras pero sin correo no es cautivo", by(4));
}

// 2. Editar R1 -> R2 en la misma S000xx
const r1 = await quote();
let s1 = await api("sync", { quote: r1 });
const soId = s1.data.id;
ok(s1.status === 200 && s1.data.rev === 1, "sync R1 crea la cotización", s1);
s1 = await api("sync", { quote: { ...r1, enviada: true } });
ok((await order(soId)).state === "sent", "R1 marcada como enviada");

const r2 = await quote({ uuid: r1.uuid, folio: r1.folio, rev: 2, items: [{ productId: 10, n: "Playera Unisex", q: 20, p: 170, c: 90 }],
  historial: [{ rev: 1, sello: r1.sello, total: calc(r1).total, fecha: r1.fecha }] });
const s2 = await api("sync", { quote: r2 });
let so = await order(soId);
const st = await state();
const lines = st["sale.order.line"].filter((l) => l.order_id === soId);
ok(s2.status === 200 && s2.data.id === soId && s2.data.rev === 2 && s2.data.enviada === false, "sync R2 actualiza la misma sale.order", s2);
ok(so.client_order_ref === r1.folio + "-R2", "client_order_ref = folio visible -R2", so.client_order_ref);
ok(so.state === "draft", "de 'sent' regresó a borrador (action_draft)", so.state);
ok(lines.length === 1 && lines[0].product_uom_qty === 20, "líneas reemplazadas con [5,0,0]", lines);
const nota = st["mail.message"].find((m) => m.res_id === soId && m.subtype_xmlid === "mail.mt_note");
ok(nota && /Rev 2 · Total antes \$1,800\.00 → ahora \$3,400\.00/.test(nota.body), "nota interna en el chatter con totales", nota);
const s2b = await api("sync", { quote: r2 });
ok(s2b.status === 200 && (await state())["mail.message"].filter((m) => m.res_id === soId).length === 1, "reintentar R2 es idempotente");

// 3. Verificar distingue R1 de R2
let v = await api(`verificar?folio=${r1.folio}&sello=${r1.sello}`);
ok(v.data.estado === "anterior" && v.data.rev === 1 && v.data.vigente === 2 && v.data.totalAnterior === 1800 && v.data.total === 3400,
  "sello R1 -> revisión anterior con ambos totales", v.data);
v = await api(`verificar?folio=${r1.folio}-R2&sello=${r2.sello}`);
ok(v.data.estado === "autentica" && v.data.rev === 2, "sello R2 con folio -R2 -> auténtica", v.data);
v = await api(`verificar?folio=${r1.folio}&sello=AAAAAAAAAAAAAAAA`);
ok(v.data.estado === "invalido", "sello falso -> inválido");

// 4. Sello que no coincide con el contenido de la revisión
const bad = await api("sync", { quote: { ...r2, rev: 3 } });
ok(bad.status === 422, "R3 con sello de R2 se rechaza (kk-v2 incluye rev)", bad);

// 5. Correo: cautivo, idempotente, forzado
let c = await api("correo", { uuid: r1.uuid, rev: 2, pdfBase64: "JVBERi0xLjQK" });
so = await order(soId);
let msgs = (await state())["mail.message"].filter((m) => m.res_id === soId && m.subtype_xmlid === "mail.mt_comment");
ok(c.status === 200 && c.data.email === "ana@scouts12.mx" && c.data.rev === 2, "correo a cliente cautivo", c);
ok(msgs.length === 1 && msgs[0].partner_ids[0] === 1 && msgs[0].attachment_ids.length === 1 && msgs[0].body_is_html, "message_post con cliente, PDF y HTML", msgs[0]);
ok(msgs[0] && msgs[0].subject === `Cotización ${r1.folio}-R2 · Kuu Kum Personalizados` && /Grupo Scouts 12/.test(msgs[0].body), "asunto y plantilla con placeholders", msgs[0]);
ok(so.state === "sent", "correo marca la cotización como enviada");
const att = (await state())["ir.attachment"].at(-1);
ok(att.res_model === "sale.order" && att.res_id === soId && att.name === `Cotizacion_${r1.folio}-R2.pdf`, "PDF adjunto a la sale.order", att);
c = await api("correo", { uuid: r1.uuid, rev: 2, pdfBase64: "JVBERi0xLjQK" });
ok(c.data.yaEnviado === true && (await state())["mail.message"].filter((m) => m.subtype_xmlid === "mail.mt_comment" && m.res_id === soId).length === 1, "no reenvía dos veces el mismo rev");
c = await api("correo", { uuid: r1.uuid, rev: 2, force: true, pdfBase64: "JVBERi0xLjQK" });
ok(c.status === 200 && (await state())["mail.message"].filter((m) => m.subtype_xmlid === "mail.mt_comment" && m.res_id === soId).length === 2, "reenvío explícito (force) sí manda");

// 6. Correo rechazado: cliente sin compras (aunque se fuerce) y antes de subir
const nq = await quote({ cliente: { odooId: 3, nombre: "Cliente Sin Compras", tel: "442 333 4444", email: "nuevo@ejemplo.mx" } });
c = await api("correo", { uuid: nq.uuid, rev: 1, pdfBase64: "JVBERi0xLjQK" });
ok(c.status === 409 && /Primero debe subir/.test(c.data.error), "correo antes del sync -> 409", c);
await api("sync", { quote: nq });
c = await api("correo", { uuid: nq.uuid, rev: 1, force: true, pdfBase64: "JVBERi0xLjQK" });
ok(c.status === 403 && !c.data.auth, "cliente sin compras -> 403 (regla de negocio, no de sesión)", c);

// 7. Editar una cotización que ya es pedido: 409 y no toca Odoo
await setOdoo("sale.order", soId, { state: "sale" });
const before = JSON.stringify((await state())["sale.order.line"].filter((l) => l.order_id === soId));
const r3 = await quote({ uuid: r1.uuid, folio: r1.folio, rev: 3, items: [{ productId: 11, n: "Gorra", q: 5, p: 150, c: 70 }] });
const s3 = await api("sync", { quote: r3 });
ok(s3.status === 409 && /ya es pedido/.test(s3.data.error) && /Duplícala/.test(s3.data.error), "R3 sobre pedido confirmado -> 409 con mensaje", s3);
ok(JSON.stringify((await state())["sale.order.line"].filter((l) => l.order_id === soId)) === before, "Odoo no se modificó");

// 8. Reporte con 3 fotos, idempotente por clientId
const foto = { name: "captura.jpg", mimetype: "image/jpeg", data: "/9j/4AAQSkZJRgABAQ==" };
const rep = { clientId: "e2e-" + run, pantalla: "Paso 2 Productos", titulo: "No suma bien", descripcion: "Agregué 3 playeras y el total no cambió.",
  diag: { app: { version: "0.3.0", instalada: true }, dispositivo: { os: "iOS 26.0.1", navegador: "Safari 26.0" }, datos: {}, errores: [{ fecha: "x", tipo: "api", mensaje: "boom" }] },
  fotos: [foto, foto, foto] };
let r = await api("reportes", rep);
ok(r.status === 200 && /^CT-\d{4}$/.test(r.data.id), "reporte -> ID CT-000N", r);
const mail = (await state())["mail.mail"].at(-1);
ok(mail && mail.subject === `[Cotiza App][${r.data.id}][Paso 2 Productos] No suma bien`, "asunto del correo", mail && mail.subject);
ok(mail && mail.email_to === "hola@kuukum.com" && mail.reply_to === EMAIL && mail.auto_delete === false && mail.state === "sent", "destino, reply_to, enviado", mail);
const atts = (await state())["ir.attachment"].filter((a) => mail.attachment_ids[0][2].includes(a.id));
ok(atts.length === 4 && atts.filter((a) => a.mimetype === "image/jpeg").length === 3, "3 fotos adjuntas + JSON", atts.map((a) => a.name));
const dj = atts.find((a) => a.name === `diagnostico-${r.data.id}.json`);
const djson = dj && JSON.parse(Buffer.from(dj.datas, "base64").toString("utf8"));
ok(djson && djson.diag.dispositivo.os === "iOS 26.0.1" && djson.servidor.commit && !("ip" in djson.servidor), "diagnostico-CT-000N.json completo, sin IP", djson && djson.servidor);
const bloque = mail && (mail.body_html.match(/---ticket---[\s\S]*?---fin---/) || [""])[0];
ok(new RegExp(`^---ticket---\nid: ${r.data.id}\npantalla: Paso 2 Productos\nusuario: ${EMAIL}\nversion: 0\\.3\\.0\ncommit: \\S+\nos: iOS 26\\.0\\.1\nnavegador: Safari 26\\.0\ninstalada: true\nestado: nuevo\n---fin---$`).test(bloque),
  "bloque ---ticket--- con version, commit, os, navegador, instalada", bloque);
ok(mail && /<h3[^>]*>App<\/h3>/.test(mail.body_html) && /Dispositivo/.test(mail.body_html) && /Sincronización/.test(mail.body_html) && /Errores recientes \(1\)/.test(mail.body_html), "tablas App, Dispositivo, Sincronización, Errores");
const n = (await state())["mail.mail"].length;
const again = await api("reportes", rep);
ok(again.data.id === r.data.id && (await state())["mail.mail"].length === n, "reintento con el mismo clientId no duplica");
r = await api("reportes", { ...rep, clientId: "x" + run, pantalla: "Inventada" });
ok(r.status === 400, "pantalla inválida -> 400");

// 9. Sesión de un correo sin acceso -> 403 con auth:true
const intruso = "kk_session=" + await makeSession(env, "intruso@ejemplo.com", "X");
r = await api("clientes", null, intruso);
ok(r.status === 403 && r.data.auth === true, "correo sin acceso -> 403 auth:true");

// 10. Logs del servidor y correlación
{
  let r = await api("clientes");
  ok(/^[0-9a-f]{8,}$/.test(r.rid || ""), "toda respuesta trae x-request-id", r.rid);
  r = await api("verificar");
  ok(r.status === 400 && r.data.requestId === r.rid, "error con {error, requestId}", r.data);
  // Error de Odoo provocado: sale.order.create falla
  await fetch(ODOO + "/__fail", { method: "POST", body: JSON.stringify({ model: "sale.order", method: "create", message: "Odoo dice: campo inválido" }) });
  const fq = await quote();
  r = await api("sync", { quote: fq });
  ok(r.status === 502 && r.data.requestId === r.rid && /campo inválido/.test(r.data.error), "error de Odoo -> 502 con requestId", r.data);
  await new Promise((res) => setTimeout(res, 300));
  const { data } = await api("errores");
  const e = data.errores.find((x) => x.requestId === r.rid);
  ok(e && e.ruta === "/api/sync" && e.status === 502 && e.usuario === EMAIL && e.folio === fq.folio && /campo inválido/.test(e.mensaje), "Registro del servidor (/api/errores) lo muestra", e);
  ok(data.errores[0] && data.errores[0].requestId === r.rid, "el más reciente va primero");
  if (WRANGLER_LOG) {
    const { readFileSync } = await import("node:fs");
    await new Promise((res) => setTimeout(res, 300));
    const line = readFileSync(WRANGLER_LOG, "utf8").split("\n").map((l) => { try { return JSON.parse(l.slice(l.indexOf("{"))); } catch { return null; } })
      .find((l) => l && l.requestId === r.rid);
    ok(line && line.method === "POST" && line.status === 502 && typeof line.ms === "number" && line.folio === fq.folio && line.cliente === 1 &&
      line.odoo.some((o) => o.modelo === "sale.order" && o.metodo === "create" && o.ok === false && /campo inválido/.test(o.error)) &&
      line.odoo.every((o) => typeof o.ms === "number"), "línea JSON en el log con odoo[] medido", line);
    const raw = JSON.stringify(line || {});
    ok(!raw.includes(fq.sello) && !/bearer|kk_session|Grupo Scouts|442 111|ana@scouts/i.test(raw), "el log no lleva sello, llave, cookie ni datos del cliente");
  } else console.log("  (sin archivo de log de wrangler: se omite la revisión de la línea JSON)");
}

console.log(fails ? `\n${fails} prueba(s) fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
