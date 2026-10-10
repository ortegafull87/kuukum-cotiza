import { json, fail } from "../../lib/core.js";
import { odoo, markSent, m2o, createAttachment } from "../../lib/odoo.js";
import { money } from "../../public/js/calc.js";

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fechaLarga = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "");

// Manda la cotización por correo desde Odoo (queda en el historial de la sale.order).
// Solo a clientes cautivos: con correo y al menos un pedido confirmado distinto de esta cotización.
export async function onRequestPost({ request, env, data }) {
  const { config } = data;
  let body;
  try { body = await request.json(); } catch { return fail("Cuerpo inválido"); }
  const { uuid, pdfBase64 } = body || {};
  const rev = Number(body && body.rev) || 1;
  if (!uuid || !pdfBase64) return fail("Falta la cotización o el PDF");

  const rec = await env.KK.get("sync:" + uuid, "json");
  if (!rec || (rec.rev || 1) < rev) return fail("Primero debe subir a Odoo", 409);

  const correoKey = "correo:" + uuid;
  const prev = await env.KK.get(correoKey, "json");
  if (prev && prev.rev === (rec.rev || 1) && !body.force) return json({ ...prev, yaEnviado: true, enviada: true });

  const call = odoo(env, data.log);
  try {
    const [so] = await call("sale.order", "read", {
      ids: [rec.id], fields: ["name", "partner_id", "amount_total", "validity_date", "client_order_ref", "state"]
    });
    if (!so) return fail("La cotización ya no existe en Odoo.", 409);
    if (so.state === "cancel") return fail("La cotización está cancelada en Odoo.", 409);

    // Regla de cliente cautivo, revalidada contra Odoo.
    const partnerId = m2o(so.partner_id);
    const [p] = await call("res.partner", "read", { ids: [partnerId], fields: ["name", "email", "commercial_partner_id"] });
    if (!p || !p.email) return fail("El cliente no tiene correo en Odoo. Envíala por WhatsApp.", 403);
    const empresa = m2o(p.commercial_partner_id) || partnerId;
    const ventas = await call("sale.order", "search_count", {
      domain: [["partner_id", "child_of", empresa], ["state", "=", "sale"], ["id", "!=", rec.id]]
    });
    if (!ventas) return fail("El correo solo está disponible para clientes con al menos una compra. Envíala por WhatsApp.", 403);

    const folio = so.client_order_ref || so.name;
    data.log.folio = folio; data.log.cliente = partnerId;
    const attId = await createAttachment(call,
      { name: `Cotizacion_${folio}.pdf`, mimetype: "application/pdf", res_model: "sale.order", res_id: rec.id }, pdfBase64);

    const vars = {
      cliente: p.name, folio, total: money(so.amount_total),
      vigencia: fechaLarga(so.validity_date), whatsapp: config.whatsapp || ""
    };
    const texto = String(config.correo_cotizacion || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    const html = texto.split(/\n{2,}/).map((par) => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join("");

    await call("sale.order", "message_post", {
      ids: [rec.id],
      body: html,
      body_is_html: true,   // sin esto Odoo 19 escapa el texto y el correo mostraría las etiquetas
      subject: `Cotización ${folio} · ${config.empresa || "Kuu Kum Personalizados"}`,
      partner_ids: [partnerId],
      attachment_ids: [attId],
      message_type: "comment",
      subtype_xmlid: "mail.mt_comment"
    });

    if (so.state === "draft") await markSent(call, rec.id);
    rec.enviada = true;
    await env.KK.put("sync:" + uuid, JSON.stringify(rec));

    const out = { fecha: new Date().toISOString(), email: p.email, rev: rec.rev || 1, por: data.user.email };
    await env.KK.put(correoKey, JSON.stringify(out));
    return json({ ...out, enviada: true });
  } catch (e) {
    return fail(e.message, 502);
  }
}
