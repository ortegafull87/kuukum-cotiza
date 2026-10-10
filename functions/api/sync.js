import { json, fail, sealFor, allowedEmails } from "../../lib/core.js";
import { odoo, getOrCreate, markSent, leerOrden, MSG_ESTADO } from "../../lib/odoo.js";
import { calc, money } from "../../public/js/calc.js";
import { folioVisible, cleanSeal } from "../../public/js/canonical.js";

const CANALES = { WA: "WhatsApp", IG: "Instagram", FB: "Facebook", TT: "TikTok", OT: "Otro" };
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const last10 = (s) => String(s || "").replace(/\D/g, "").slice(-10);
const YA_PEDIDO = "Esta cotización ya es pedido (o está cancelada) en Odoo. Duplícala para hacer una nueva.";

// Recibe una cotización del teléfono y la crea en Odoo (idempotente por uuid).
// Si llega una revisión nueva (rev mayor a la guardada), actualiza la misma sale.order.
export async function onRequestPost({ request, env, data }) {
  const { config } = data;
  let q;
  try { q = (await request.json()).quote; } catch { return fail("Cuerpo inválido"); }
  if (!q || !q.uuid || !q.folio || !q.items || !q.items.length) return fail("Cotización incompleta");

  const t = calc(q);
  const rev = Number(q.rev) || 1;
  const autor = String(q.creadoPor || data.user.email).toLowerCase();
  if (!allowedEmails(env, config).has(autor)) return fail("El autor de la cotización no tiene acceso", 403);
  if ((await sealFor(env, autor, q, t)) !== q.sello) return fail("El sello no coincide con el contenido. No se sincronizó.", 422);

  data.log.folio = folioVisible(q.folio, rev);
  const call = odoo(env, data.log);
  const syncKey = "sync:" + q.uuid;
  const sealKey = "seal:" + String(q.folio).toUpperCase();
  try {
    let rec = await env.KK.get(syncKey, "json");

    if (!rec) {
      const vals = await orderVals(env, call, config, q);
      data.log.cliente = vals.partner_id;
      const [id] = await call("sale.order", "create", { vals_list: [vals] });
      const [{ name }] = await call("sale.order", "read", { ids: [id], fields: ["name"] });
      rec = { id, name, partnerId: vals.partner_id, enviada: false, rev };
      await env.KK.put(syncKey, JSON.stringify(rec));
      await env.KK.put(sealKey, JSON.stringify(sealRecord(q, t, autor, name, mergeHistorial(null, q.historial, rev))));
      const n = Number(String(q.folio).replace(/\D/g, "")) || 0;
      const prevN = Number(await env.KK.get("folio:" + autor)) || 0;
      if (n > prevN) await env.KK.put("folio:" + autor, String(n));
    } else if (rev > (rec.rev || 1)) {
      // Revisión: solo si en Odoo sigue siendo cotización (borrador o enviada).
      const so = await leerOrden(call, rec.id, ["state", "amount_total"]);
      if (!so) return json({ error: MSG_ESTADO.eliminada, codigo: "eliminada" }, 409);
      if (so.state === "sale" || so.state === "cancel") return json(so.state === "cancel" ? { error: MSG_ESTADO.cancel, codigo: "cancel" } : { error: YA_PEDIDO, codigo: "sale" }, 409);
      if (so.state === "sent") await call("sale.order", "action_draft", { ids: [rec.id] });

      const prevSeal = await env.KK.get(sealKey, "json");
      // Cliente nuevo sin odooId: si es el mismo de la revisión anterior, reusar el contacto ya creado.
      const prev = prevSeal && prevSeal.snapshot;
      const mismo = prev && prev.cliente === q.cliente.nombre && last10(prev.tel) === last10(q.cliente.tel);
      const vals = await orderVals(env, call, config, q, mismo ? rec.partnerId : null);
      data.log.cliente = vals.partner_id;
      await call("sale.order", "write", {
        ids: [rec.id],
        vals: { ...vals, order_line: [[5, 0, 0], ...vals.order_line] }
      });
      const antes = prevSeal && prevSeal.snapshot ? prevSeal.snapshot.total : Number(so.amount_total) || 0;
      await call("sale.order", "message_post", {
        ids: [rec.id],
        body: `Actualizada desde Cotiza App · Rev ${rev} · Total antes ${money(antes)} → ahora ${money(t.total)}`,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note"
      });
      rec = { ...rec, partnerId: vals.partner_id, enviada: false, rev };
      await env.KK.put(syncKey, JSON.stringify(rec));
      await env.KK.put(sealKey, JSON.stringify(sealRecord(q, t, autor, rec.name, mergeHistorial(prevSeal, q.historial, rev))));
    }

    // Marcar como "Cotización enviada" cuando se mandó el PDF (de la revisión vigente).
    // Odoo manda: solo se marca si sigue en borrador. Si ya está enviada, confirmada, cancelada o eliminada no se toca
    // (el fallback de markSent escribiría state=sent y "des-cancelaría" la orden).
    if (q.enviada && !rec.enviada && rev >= (rec.rev || 1)) {
      const so = await leerOrden(call, rec.id, ["state"]);
      if (so && so.state === "draft") await markSent(call, rec.id);
      rec.enviada = true;
      rec.estadoOdoo = so ? (so.state === "draft" ? "sent" : so.state) : "eliminada";
      await env.KK.put(syncKey, JSON.stringify(rec));
    }

    return json({ id: rec.id, name: rec.name, enviada: rec.enviada, rev: rec.rev || 1, ...(rec.estadoOdoo ? { estadoOdoo: rec.estadoOdoo } : {}) });
  } catch (e) {
    return fail(e.message, 502);
  }
}

// Cliente: usar el de Odoo, o buscar por teléfono, o crear.
async function resolvePartner(call, cliente) {
  if (cliente.odooId) return cliente.odooId;
  const tel = last10(cliente.tel);
  if (tel) {
    const all = await call("res.partner", "search_read", { domain: [["phone", "!=", false]], fields: ["id", "phone"], limit: 10000 });
    const hit = all.find((p) => last10(p.phone) === tel);
    if (hit) return hit.id;
  }
  const [id] = await call("res.partner", "create", {
    vals_list: [{ name: cliente.nombre, phone: cliente.tel || false, email: cliente.email || false, customer_rank: 1 }]
  });
  return id;
}

// Valores de la sale.order comunes a crear y a actualizar una revisión.
async function orderVals(env, call, config, q, knownPartner = null) {
  const partnerId = q.cliente.odooId || knownPartner || await resolvePartner(call, q.cliente);
  const canal = CANALES[q.canal] || null;
  const sourceId = canal
    ? await getOrCreate(env, call, "utm.source", [["name", "=ilike", canal]], { name: canal }, "odoo:src:" + canal)
    : false;

  const needsLibre = q.items.some((i) => !i.productId);
  const libreId = needsLibre
    ? await getOrCreate(env, call, "product.product", [["default_code", "=", "KK-LIBRE"]],
        { name: "Producto personalizado", default_code: "KK-LIBRE", type: "service", sale_ok: true, list_price: 0 }, "odoo:libre")
    : null;

  const taxes = q.iva ? [Number(config.iva_tax_id)] : [];
  const order_line = q.items.map((i) => [0, 0, {
    product_id: i.productId || libreId,
    name: i.n,
    product_uom_qty: Number(i.q),
    price_unit: Number(i.p),
    discount: Number(q.desc) || 0,
    tax_ids: [[6, 0, taxes]],
    purchase_price: Number(i.c) || 0
  }]);

  const folio = folioVisible(q.folio, q.rev);
  const vence = new Date(q.fecha); vence.setDate(vence.getDate() + (Number(q.vigencia) || 15));
  const note = [
    "<p><strong>TÉRMINOS Y CONDICIONES</strong></p>",
    `<p>Anticipo del ${q.anticipoPct}% para confirmar el pedido. Tiempo de entrega: ${esc(q.entrega)}.</p>`,
    `<p>${esc(config.terminos)}</p>`,
    `<p>${esc(config.banco)} · CLABE ${esc(config.clabe)} · Beneficiario: ${esc(config.beneficiario)}</p>`,
    q.notas ? `<p>${esc(q.notas)}</p>` : "",
    `<p><em>Folio app ${esc(folio)} · Sello ${esc(q.sello)}</em></p>`
  ].join("");

  return {
    partner_id: partnerId,
    client_order_ref: folio,
    source_id: sourceId,
    validity_date: vence.toISOString().slice(0, 10),
    note,
    order_line
  };
}

// Registro para la pantalla Verificar.
function sealRecord(q, t, autor, odooName, historial) {
  return {
    sello: q.sello, email: autor, odoo: odooName, rev: Number(q.rev) || 1, historial,
    snapshot: {
      fecha: q.fecha, cliente: q.cliente.nombre, tel: q.cliente.tel || "",
      items: q.items.map((i) => ({ n: i.n, q: i.q, p: i.p })),
      desc: q.desc, iva: !!q.iva, anticipoPct: q.anticipoPct,
      total: t.total, anticipo: t.anticipo
    }
  };
}

// Revisiones anteriores. Manda lo que ya registró el servidor; del teléfono solo se toman
// las que el servidor nunca vio (p. ej. R2 hecha y editada a R3 sin internet).
function mergeHistorial(prevSeal, deApp, rev) {
  const m = new Map();
  for (const h of Array.isArray(deApp) ? deApp : []) {
    const r = Number(h && h.rev);
    if (r && h.sello) m.set(r, { rev: r, sello: cleanSeal(h.sello), total: Number(h.total) || 0, fecha: String(h.fecha || "") });
  }
  if (prevSeal) {
    for (const h of prevSeal.historial || []) m.set(h.rev, h);
    const r = prevSeal.rev || 1;
    m.set(r, { rev: r, sello: prevSeal.sello, total: prevSeal.snapshot.total, fecha: prevSeal.snapshot.fecha });
  }
  return [...m.values()].filter((h) => h.rev < rev).sort((a, b) => a.rev - b.rev);
}
