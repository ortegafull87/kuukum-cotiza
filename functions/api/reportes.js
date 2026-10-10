import { json, fail } from "../../lib/core.js";
import { odoo } from "../../lib/odoo.js";

const PANTALLAS = ["Inicio de sesión", "Paso 1 Cliente", "Paso 2 Productos", "Paso 3 Condiciones", "Paso 4 Verificar",
  "Lista de cotizaciones", "Detalle de cotización", "PDF", "Envío por WhatsApp", "Sincronización con Odoo", "Ajustes", "Otro"];
const MAX_FOTOS = 5, MAX_FOTO_B64 = 4 * 1024 * 1024;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Reporte de un problema: ID consecutivo CT-0001, registro en KV y correo vía Odoo con las fotos.
// Idempotente por clientId: si la app reintenta (cola sin internet) no se duplica el ticket.
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
    const diag = b.diag && typeof b.diag === "object" ? b.diag : {};
    t = {
      id, estado: "nuevo", pantalla, titulo, descripcion, diag, email: data.user.email,
      fecha: new Date().toISOString(), fotos: fotos.length, enviado: false
    };
    await env.KK.put("ticket:" + id, JSON.stringify(t));
    if (clientId) await env.KK.put("ticketc:" + clientId, id);
  }

  try {
    const call = odoo(env);
    const attIds = [];
    for (const [i, f] of fotos.entries()) {
      const ext = f.mimetype === "image/png" ? "png" : "jpg";
      const [aid] = await call("ir.attachment", "create", {
        vals_list: [{ name: String(f.name || `${id}_foto${i + 1}.${ext}`).slice(0, 120), datas: f.data, mimetype: f.mimetype }]
      });
      attIds.push(aid);
    }
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

function bodyHtml(t) {
  const fecha = new Date(t.fecha).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
  const diag = Object.entries(t.diag).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
  const row = (k, v, pre) => `<tr><th align="left" valign="top" style="padding:6px 10px;background:#E8F6F4;white-space:nowrap">${k}</th>` +
    `<td style="padding:6px 10px">${pre ? `<pre style="margin:0;white-space:pre-wrap;font-family:monospace">${esc(v)}</pre>` : esc(v)}</td></tr>`;
  const bloque = ["---ticket---", `id: ${t.id}`, `pantalla: ${t.pantalla}`, `usuario: ${t.email}`,
    `version: ${t.diag.version || ""}`, `estado: ${t.estado}`, "---fin---"].join("\n");
  return `<table style="border-collapse:collapse;border:1px solid #DCE5E5;font-family:sans-serif;font-size:14px">` +
    row("Ticket", t.id) + row("Fecha", fecha) + row("Usuario", t.email) + row("Pantalla", t.pantalla) +
    row("Título", t.titulo) + row("Descripción", t.descripcion, true) + row("Diagnóstico", diag, true) +
    `</table><p>Fotos adjuntas: ${t.fotos}</p><pre style="font-family:monospace">${esc(bloque)}</pre>`;
}
