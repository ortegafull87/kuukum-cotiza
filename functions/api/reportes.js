import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

const PANTALLAS = ["Inicio de sesión", "Paso 1 Cliente", "Paso 2 Productos", "Paso 3 Condiciones", "Paso 4 Verificar",
  "Lista de cotizaciones", "Detalle de cotización", "PDF", "Envío por WhatsApp", "Sincronización con Odoo", "Ajustes", "Otro"];
const MAX_FOTOS = 5, MAX_FOTO_B64 = 4 * 1024 * 1024;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Reporte de un problema: ID consecutivo CT-0001, registro en KV y correo vía Odoo con las fotos.
// Idempotente por clientId: si la app reintenta (cola sin internet) no se duplica el ticket.
// El servidor agrega hora, commit desplegado y país/colo de Cloudflare. Nunca la IP ni ubicación precisa.
export async function onRequestPost({ request, env, data }) {
  let b;
  try { b = await request.json(); } catch { return fail("Cuerpo inválido"); }
  const pantalla = String(b.pantalla || "");
  const titulo = String(b.titulo || "").trim().slice(0, 120);
  const descripcion = String(b.descripcion || "").trim().slice(0, 10000);
  const fotos = Array.isArray(b.fotos) ? b.fotos : [];
  if (!PANTALLAS.includes(pantalla)) return fail("Elige la pantalla donde pasó el problema.");
  if (!titulo || !descripcion) return fail("Escribe el nombre del error y la descripción.");
  if (fotos.length > MAX_FOTOS) return fail(`Máximo ${MAX_FOTOS} fotos.`);
  if (fotos.some((f) => !f || typeof f.data !== "string" || f.data.length > MAX_FOTO_B64 || !/^image\//.test(f.mimetype || ""))) {
    return fail("Alguna foto no es válida o es demasiado grande.");
  }

  const clientId = String(b.clientId || "").slice(0, 64);
  let id = clientId ? await env.KK.get("ticketc:" + clientId) : null;
  let t = id ? await env.KK.get("ticket:" + id, "json") : null;
  if (t && t.enviado) return json({ id });

  if (!t) {
    const n = (Number(await env.KK.get("ticket:seq")) || 0) + 1;
    await env.KK.put("ticket:seq", String(n));
    id = "CT-" + String(n).padStart(4, "0");
    let diag = b.diag && typeof b.diag === "object" ? b.diag : {};
    if (JSON.stringify(diag).length > 200000) diag = { recortado: "El diagnóstico superó 200 KB", app: diag.app || {} };
    const cf = request.cf || {};
    t = {
      id, estado: "nuevo", pantalla, titulo, descripcion, diag, email: data.user.email,
      fecha: new Date().toISOString(), fotos: fotos.length, enviado: false,
      servidor: {
        hora: new Date().toISOString(),
        commit: env.CF_PAGES_COMMIT_SHA || "local", rama: env.CF_PAGES_BRANCH || "local",
        pais: cf.country || "", colo: cf.colo || ""
      }
    };
    await env.KK.put("ticket:" + id, JSON.stringify(t));
    if (clientId) await env.KK.put("ticketc:" + clientId, id);
  }

  data.log.ticket = id;
  try {
    const call = odoo(env, data.log);
    const attIds = [];
    for (const [i, f] of fotos.entries()) {
      const ext = f.mimetype === "image/png" ? "png" : "jpg";
      const [aid] = await call("ir.attachment", "create", {
        vals_list: [{ name: String(f.name || `${id}_foto${i + 1}.${ext}`).slice(0, 120), datas: f.data, mimetype: f.mimetype }]
      });
      attIds.push(aid);
    }
    // Todo el diagnóstico en JSON, para el futuro sistema de tickets.
    const full = JSON.stringify({ ticket: { ...t, diag: undefined }, diag: t.diag, servidor: t.servidor }, null, 2);
    const [jsonId] = await call("ir.attachment", "create", {
      vals_list: [{ name: `diagnostico-${id}.json`, datas: b64utf8(full), mimetype: "application/json" }]
    });
    attIds.push(jsonId);
    const to = String(data.config.reportes_email || "hola@kuukum.com").trim();
    const [mailId] = await call("mail.mail", "create", {
      vals_list: [{
        subject: `[Cotiza App][${id}][${pantalla}] ${titulo}`,
        body_html: bodyHtml(t),
        email_to: to,
        reply_to: t.email,
        attachment_ids: [[6, 0, attIds]],
        auto_delete: false
      }]
    });
    await call("mail.mail", "send", { ids: [mailId] });
    t.enviado = true; t.mailId = mailId;
    await env.KK.put("ticket:" + id, JSON.stringify(t));
    return json({ id });
  } catch (e) {
    // El ticket queda guardado; la app lo reintenta con el mismo clientId y solo se manda el correo.
    return fail(`Reporte ${id} guardado, pero no se pudo mandar el correo: ${e.message}`, 502);
  }
}

const b64utf8 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); };
const val = (v) => (v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function bodyHtml(t) {
  const fecha = new Date(t.fecha).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
  const d = t.diag || {}, app = d.app || {}, dev = d.dispositivo || {}, datos = d.datos || {}, srv = t.servidor || {};
  const errores = Array.isArray(d.errores) ? d.errores : [];
  const th = (k) => `<th align="left" valign="top" style="padding:6px 10px;background:#E8F6F4;white-space:nowrap">${k}</th>`;
  const row = (k, v, pre) => `<tr>${th(k)}<td style="padding:6px 10px">${pre ? `<pre style="margin:0;white-space:pre-wrap;font-family:monospace">${esc(v)}</pre>` : esc(v)}</td></tr>`;
  const table = (title, rows) => `<h3 style="font-family:sans-serif;margin:18px 0 6px">${title}</h3>` +
    `<table style="border-collapse:collapse;border:1px solid #DCE5E5;font-family:sans-serif;font-size:14px">${rows.map(([k, v]) => row(k, val(v))).join("")}</table>`;
  const version = app.version || d.version || "";
  const bloque = ["---ticket---", `id: ${t.id}`, `pantalla: ${t.pantalla}`, `usuario: ${t.email}`,
    `version: ${version}`, `commit: ${srv.commit || ""}`, `os: ${dev.os || ""}`, `navegador: ${dev.navegador || ""}`,
    `instalada: ${app.instalada === undefined ? (d.appInstalada ?? "") : app.instalada}`, `estado: ${t.estado}`, "---fin---"].join("\n");
  const borr = app.borrador && typeof app.borrador === "object" ? `${app.borrador.folio} · R${app.borrador.rev} · paso ${app.borrador.paso}` : app.borrador;
  return `<table style="border-collapse:collapse;border:1px solid #DCE5E5;font-family:sans-serif;font-size:14px">` +
    row("Ticket", t.id) + row("Fecha", fecha) + row("Usuario", t.email) + row("Pantalla", t.pantalla) +
    row("Título", t.titulo) + row("Descripción", t.descripcion, true) + `</table>` +
    table("App", [["Versión", version + (app.versionDifiere === true ? ` (publicada: ${app.versionPublicada})` : "")], ["Commit", `${srv.commit} (${srv.rama})`],
      ["Caché / SW", `${val(app.cache)} · ${val(app.serviceWorker)}`], ["Instalada", app.instalada], ["Ruta", app.ruta], ["Borrador", borr],
      ["Hora local", app.fechaLocal], ["Servidor", `${srv.hora} · ${srv.pais} · ${srv.colo}`]]) +
    table("Dispositivo", [["Sistema", dev.os], ["Navegador", dev.navegador], ["Modelo", dev.modelo], ["Pantalla", `${val(dev.pantalla)} @${val(dev.densidad)}x · viewport ${val(dev.viewport)} · ${val(dev.orientacion)}`],
      ["Conexión", `${val(dev.conexion)} · ${val(dev.red)}`], ["Tema / idioma", `${val(dev.tema)} · ${val(dev.idiomas)}`], ["Cámara", dev.permisoCamara], ["User agent", dev.userAgent || d.userAgent]]) +
    table("Sincronización", [["Cotizaciones", `${val(datos.cotizaciones)} · por subir ${val(datos.porSubir ?? d.porSubir)} · con error ${val(datos.conError)}`],
      ["Último sync", datos.ultimoSync], ["Catálogo", `${val(datos.productos)} productos (${val(datos.catalogoDescargado)})`],
      ["Clientes", `${val(datos.clientes)} (${val(datos.clientesDescargados)})`], ["Almacenamiento", `${val(datos.almacenamiento)} · localStorage ${val(datos.localStorage)}`],
      ["Llave del sello", datos.llaveSello], ["Errores de sync", (datos.erroresSync || d.erroresSync || []).map((e) => `${e.fecha} ${e.folio} ${e.error}`).join(" | ")]]) +
    `<h3 style="font-family:sans-serif;margin:18px 0 6px">Errores recientes (${errores.length})</h3>` +
    `<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap">${esc(errores.slice(-30).map((e) => `${e.fecha} · ${e.tipo || ""} ${e.ruta || ""} ${e.status ?? ""} ${e.mensaje || ""}${e.requestId ? " · req " + e.requestId : ""}`).join("\n") || "—")}</pre>` +
    `<p style="font-family:sans-serif">Fotos adjuntas: ${t.fotos} · Diagnóstico completo: diagnostico-${t.id}.json</p>` +
    `<pre style="font-family:monospace">${esc(bloque)}</pre>`;
}
