// Prueba e2e de la API contra wrangler + Odoo simulado (ver README, "Pruebas locales").
// Uso: node scripts/e2e.mjs [http://localhost:8788] [http://localhost:8069] [archivo con la salida de wrangler]
import { makeSession, sealFor } from "../lib/core.js";
import { calc } from "../public/js/calc.js";
import { canonical, FOLIO_RE, folioNumero, FOLIO_PREFIX } from "../public/js/canonical.js";
import { nextFolio } from "../public/js/store.js";
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

// 0c. Archivos de la app: versiones coherentes, CSP de la red de seguridad, sin /index.html en el precache
{
  const { readFileSync, readdirSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const pub = (p) => readFileSync(new URL("../public/" + p, import.meta.url), "utf8");
  const ver = JSON.parse(pub("version.json")).version;
  const html = pub("index.html");
  const all = [html, ...readdirSync(new URL("../public/js/", import.meta.url)).map((f) => pub("js/" + f))].join("\n");
  const vs = [...all.matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  ok(vs.length >= 20 && vs.every((v) => v === ver), `todos los ?v= son ${ver} (${vs.length})`, [...new Set(vs)]);
  ok(!/from\s+"\.\/[\w-]+\.js"/.test(all) && !/(src|href)="\/(js|vendor)\/[^"?]+"/.test(html) && /href="\/styles\.css\?v=/.test(html), "ningún módulo, script o CSS sin ?v=");
  const sw = pub("sw.js");
  ok(sw.includes(`const VERSION = "${ver}"`) && pub("js/app.js").includes(`const APP_VERSION = "${ver}"`), "sw.js y app.js con la misma versión");
  ok(!/["']\/index\.html["']/.test(sw), "sw.js no precachea /index.html (Cloudflare lo redirige)");
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(inline).digest("base64");
  ok(pub("_headers").includes(`'sha256-${hash}'`), "CSP permite el script en línea de la red de seguridad (hash al día)", hash);
  ok(!/localStorage\.(clear|removeItem)|indexedDB\.deleteDatabase/.test(inline), "la red de seguridad no borra localStorage ni IndexedDB");
}

// 0d. Folios AP- (v0.4.4) y compatibilidad con KK-
{
  const validos = ["AP-K0006", "KK-K0005", "AP-L0012-R2", "KK-L0012-R3", "AP-V10000"];
  const invalidos = ["XX-K0001", "AP-K12", "ap-k0006", "AP-K0006-R", "KK-0005", "AP-KK0006"];
  ok(validos.every((f) => FOLIO_RE.test(f)) && !invalidos.some((f) => FOLIO_RE.test(f)), "regex de folio: acepta KK- y AP- (con -Rn), rechaza lo demás");
  ok(FOLIO_PREFIX === "AP" && folioNumero("KK-K0005") === 5 && folioNumero("AP-K0006-R2") === 6, "folioNumero entiende los dos prefijos");
  ok(nextFolio({ email: "kuukum.mx@gmail.com", prefijo: "K", ultimoFolio: 5 }) === "AP-K0006", "después de KK-K0005 sigue AP-K0006 (no se reinicia)");
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
ok(msgs[0] && msgs[0].email_from === '"Kuu Kum Personalizados" <notifications@kuukum.odoo.com>', "correo de cotización con remitente de Odoo", msgs[0] && msgs[0].email_from);
ok(msgs.length === 1 && msgs[0].partner_ids[0] === 1 && msgs[0].attachment_ids.length === 1 && msgs[0].body_is_html, "message_post con cliente, PDF y HTML", msgs[0]);
ok(msgs[0] && msgs[0].subject === `Cotización ${r1.folio}-R2 · Kuu Kum Personalizados` && /Grupo Scouts 12/.test(msgs[0].body), "asunto y plantilla con placeholders", msgs[0]);
ok(so.state === "sent", "correo marca la cotización como enviada");
const att = (await state())["ir.attachment"].at(-1);
ok(att.res_model === "sale.order" && att.res_id === soId && att.name === `Cotizacion_${r1.folio}-R2.pdf` && att.file_size === 9, "PDF adjunto a la sale.order con file_size correcto", att);
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
ok(mail && mail.email_to === "hola@kuukum.mx" && mail.reply_to === EMAIL && mail.auto_delete === false && mail.state === "sent", "destino, reply_to, enviado", mail);
ok(mail && mail.email_from === '"Cotiza App" <notifications@kuukum.odoo.com>', "remitente de Odoo (no el correo del usuario)", mail && mail.email_from);
const atts = (await state())["ir.attachment"].filter((a) => mail.attachment_ids[0][2].includes(a.id));
ok(atts.length === 4 && atts.filter((a) => a.mimetype === "image/jpeg").length === 3, "3 fotos adjuntas + JSON", atts.map((a) => a.name));
const dj = atts.find((a) => a.name === `diagnostico-${r.data.id}.json`);
const djson = dj && JSON.parse(Buffer.from(dj.raw, "base64").toString("utf8"));
ok(atts.every((a) => a.file_size > 0 && a.file_size === Buffer.from(a.raw, "base64").length && !("datas" in a)), "adjuntos con raw y file_size > 0 (correcto)", atts.map((a) => [a.name, a.file_size]));
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

// 8b. Adjunto que Odoo guarda vacío: error con requestId y NO se manda el correo
{
  await fetch(ODOO + "/__attach", { method: "POST", body: JSON.stringify({ mode: "empty" }) });
  const antes = (await state())["mail.mail"].length;
  const r0 = await api("reportes", { ...rep, clientId: "vacio-" + run, fotos: [{ ...foto, data: "data:image/jpeg;base64," + foto.data }] });
  const st0 = await state();
  ok(r0.status === 502 && r0.data.requestId && /0 bytes/.test(r0.data.error), "adjunto en 0 bytes -> 502 con requestId", r0.data);
  ok(st0["mail.mail"].length === antes, "no se manda el correo incompleto");
  ok(!st0["ir.attachment"].some((a) => a.file_size === 0), "el adjunto vacío se borra");
  const r1 = await api("reportes", { ...rep, clientId: "vacio-" + run, fotos: [{ ...foto, data: "data:image/jpeg;base64," + foto.data }] });
  const m1 = (await state())["mail.mail"].at(-1);
  ok(r1.status === 200 && r1.data.id === r0.data.error.match(/CT-\d{4}/)[0] && m1.attachment_ids[0][2].length === 2, "al reintentar se manda el mismo ticket (prefijo data: aceptado)", r1);
}

// 8c. reportes_email ya no es configurable (ahora es env.REPORTES_EMAIL)
{
  const r = await fetch(APP + "/api/config", { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ reportes_email: "otro@ejemplo.com" }) });
  const cfg = await r.json();
  ok(r.status === 200 && !("reportes_email" in cfg), "PUT /api/config ignora reportes_email", cfg.reportes_email);
}

// 8c2. Folio AP-: sello, client_order_ref, contador del servidor, Verificar y QR; revisión de una KK- conserva su prefijo
{
  const me0 = (await api("me")).data.ultimoFolio;
  const ap = await quote({ folio: "AP-V" + String(me0 + 1).padStart(4, "0") });
  const r = await api("sync", { quote: ap });
  ok(r.status === 200 && (await order(r.data.id)).client_order_ref === ap.folio, "folio AP- sube con client_order_ref AP-…", r.data);
  ok((await api("me")).data.ultimoFolio === me0 + 1, "el contador del servidor sigue con el número del folio AP-");
  let v = await api(`verificar?folio=${ap.folio}&sello=${ap.sello}`);
  ok(v.data.estado === "autentica", "Verificar acepta AP-", v.data);
  const { parseQr } = await import("../public/js/scanner.js");
  const { qrText } = await import("../public/js/pdf.js");
  ok(JSON.stringify(parseQr(qrText(ap))) === JSON.stringify({ folio: ap.folio, sello: ap.sello }) && parseQr(qrText({ folio: "KK-K0005", sello: ap.sello })).folio === "KK-K0005", "QR con folio AP- y KK-");
  const kk = await quote({ folio: "KK-V0005" });
  await api("sync", { quote: kk });
  const kk2 = await quote({ uuid: kk.uuid, folio: "KK-V0005", rev: 2, historial: [{ rev: 1, sello: kk.sello, total: 1800, fecha: kk.fecha }] });
  const r2 = await api("sync", { quote: kk2 });
  ok(r2.status === 200 && (await order(r2.data.id)).client_order_ref === "KK-V0005-R2", "revisión de una KK- vieja conserva su prefijo: KK-V0005-R2");
  v = await api(`verificar?folio=KK-V0005-R2&sello=${kk2.sello}`);
  ok(v.data.estado === "autentica" && v.data.rev === 2, "Verificar KK-…-R2 sigue funcionando", v.data);
}

// 8d. v0.4: estado de Odoo reflejado (cancelada, eliminada, confirmada) y protecciones
{
  const unlink = (id) => fetch(ODOO + "/__unlink", { method: "POST", body: JSON.stringify({ model: "sale.order", id }) });
  const [qc, qe, qs] = [await quote(), await quote(), await quote()];
  const ids = {};
  for (const q of [qc, qe, qs]) ids[q.uuid] = (await api("sync", { quote: q })).data.id;
  let r = await api("estado", { uuids: [qc.uuid, qe.uuid, qs.uuid, "no-existe"] });
  ok(r.status === 200 && Object.keys(r.data.estados).length === 3 && r.data.estados[qc.uuid].estado === "draft" && r.rid, "POST /api/estado: draft y omite uuids sin registro", r.data);
  await setOdoo("sale.order", ids[qc.uuid], { state: "cancel" });
  await unlink(ids[qe.uuid]);
  await setOdoo("sale.order", ids[qs.uuid], { state: "sale" });
  const llamadas = (await state()).calls.length;
  r = await api("estado", { uuids: [qc.uuid, qe.uuid, qs.uuid] });
  const E = r.data.estados;
  ok(E[qc.uuid].estado === "cancel" && /^\d{4}-\d\d-\d\dT/.test(E[qc.uuid].fecha) && E[qe.uuid].estado === "eliminada" && E[qs.uuid].estado === "sale" && E[qs.uuid].odooName,
    "cancelada, eliminada y pedido confirmado (fecha de write_date)", E);
  ok((await state()).calls.slice(llamadas).filter((c) => c.model === "sale.order").length === 1, "una sola llamada a Odoo por lote");
  ok((await api("estado", { uuids: Array.from({ length: 201 }, (_, i) => "u" + i) })).status === 400, "más de 200 uuids -> 400");
  // Protecciones
  r = await api("sync", { quote: await quote({ uuid: qe.uuid, folio: qe.folio, rev: 2, historial: [{ rev: 1, sello: qe.sello, total: 1800, fecha: qe.fecha }] }) });
  ok(r.status === 409 && r.data.codigo === "eliminada" && /se eliminó en Odoo\. Duplícala/.test(r.data.error), "revisión sobre orden eliminada -> 409 'se eliminó en Odoo'", r.data);
  r = await api("sync", { quote: await quote({ uuid: qc.uuid, folio: qc.folio, rev: 2 }) });
  ok(r.status === 409 && r.data.codigo === "cancel", "revisión sobre orden cancelada -> 409 cancel", r.data);
  r = await api("sync", { quote: { ...qc, enviada: true } });
  ok(r.status === 200 && r.data.estadoOdoo === "cancel" && (await order(ids[qc.uuid])).state === "cancel", "marcar enviada no 'des-cancela' la orden en Odoo", r.data);
  r = await api("correo", { uuid: qc.uuid, rev: 1, force: true, pdfBase64: "JVBERi0xLjQK" });
  ok(r.status === 409 && r.data.codigo === "cancel", "correo de cotización cancelada -> 409", r.data);
  r = await api("correo", { uuid: qe.uuid, rev: 1, force: true, pdfBase64: "JVBERi0xLjQK" });
  ok(r.status === 409 && r.data.codigo === "eliminada", "correo de cotización eliminada -> 409", r.data);
  r = await api(`verificar?folio=${qc.folio}&sello=${qc.sello}`);
  ok(r.data.estado === "autentica" && r.data.estadoOdoo === "cancel", "Verificar: sello auténtico + estadoOdoo cancel", r.data);
  r = await api(`verificar?folio=${qe.folio}&sello=${qe.sello}`);
  ok(r.data.estado === "autentica" && r.data.estadoOdoo === "eliminada", "Verificar: sello auténtico + estadoOdoo eliminada", r.data);
  // Regresa a cotización en Odoo -> vuelve a normal
  await setOdoo("sale.order", ids[qc.uuid], { state: "draft" });
  r = await api("estado", { uuids: [qc.uuid] });
  ok(r.data.estados[qc.uuid].estado === "draft", "si en Odoo vuelve a cotización, la app la ve normal");
  // Duplicar la eliminada: folio nuevo que sube bien
  const dup = await quote({ items: qe.items });
  r = await api("sync", { quote: dup });
  ok(r.status === 200 && r.data.id !== ids[qe.uuid], "duplicar una eliminada crea otra que sube bien", r.data);
}

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
