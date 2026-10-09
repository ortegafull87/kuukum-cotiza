import { json, fail, sealFor, allowedEmails } from "../../lib/core.js";
import { odoo, getOrCreate } from "../../lib/odoo.js";
import { calc } from "../../public/js/calc.js";

const CANALES = { WA: "WhatsApp", IG: "Instagram", FB: "Facebook", TT: "TikTok", OT: "Otro" };
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const last10 = (s) => String(s || "").replace(/\D/g, "").slice(-10);

// Recibe una cotización del teléfono y la crea en Odoo (idempotente por uuid).
export async function onRequestPost({ request, env, data }) {
  const { config } = data;
  let q;
  try { q = (await request.json()).quote; } catch { return fail("Cuerpo inválido"); }
  if (!q || !q.uuid || !q.folio || !q.items || !q.items.length) return fail("Cotización incompleta");

  const t = calc(q);
  const autor = String(q.creadoPor || data.user.email).toLowerCase();
  if (!allowedEmails(env, config).has(autor)) return fail("El autor de la cotización no tiene acceso", 403);
  if ((await sealFor(env, autor, q, t)) !== q.sello) return fail("El sello no coincide con el contenido. No se sincronizó.", 422);

  const call = odoo(env);
  const syncKey = "sync:" + q.uuid;
  try {
    let rec = await env.KK.get(syncKey, "json");

    if (!rec) {
      // Cliente: usar el de Odoo, o buscar por teléfono, o crear.
      let partnerId = q.cliente.odooId || null;
      if (!partnerId) {
        const tel = last10(q.cliente.tel);
        if (tel) {
          const all = await call("res.partner", "search_read", { domain: [["phone", "!=", false]], fields: ["id", "phone"], limit: 10000 });
          const hit = all.find((p) => last10(p.phone) === tel);
          if (hit) partnerId = hit.id;
        }
        if (!partnerId) {
          [partnerId] = await call("res.partner", "create", {
            vals_list: [{ name: q.cliente.nombre, phone: q.cliente.tel || false, email: q.cliente.email || false, customer_rank: 1 }]
          });
        }
      }

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

      const vence = new Date(q.fecha); vence.setDate(vence.getDate() + (Number(q.vigencia) || 15));
      const note = [
        "<p><strong>TÉRMINOS Y CONDICIONES</strong></p>",
        `<p>Anticipo del ${q.anticipoPct}% para confirmar el pedido. Tiempo de entrega: ${esc(q.entrega)}.</p>`,
        `<p>${esc(config.terminos)}</p>`,
        `<p>${esc(config.banco)} · CLABE ${esc(config.clabe)} · Beneficiario: ${esc(config.beneficiario)}</p>`,
        q.notas ? `<p>${esc(q.notas)}</p>` : "",
        `<p><em>Folio app ${esc(q.folio)} · Sello ${esc(q.sello)}</em></p>`
      ].join("");

      const [id] = await call("sale.order", "create", {
        vals_list: [{
          partner_id: partnerId,
          client_order_ref: q.folio,
          source_id: sourceId,
          validity_date: vence.toISOString().slice(0, 10),
          note,
          order_line
        }]
      });
      const [{ name }] = await call("sale.order", "read", { ids: [id], fields: ["name"] });
      rec = { id, name, partnerId, enviada: false };
      await env.KK.put(syncKey, JSON.stringify(rec));

      // Registro para la pantalla Verificar.
      await env.KK.put("seal:" + q.folio.toUpperCase(), JSON.stringify({
        sello: q.sello, email: autor, odoo: name,
        snapshot: {
          fecha: q.fecha, cliente: q.cliente.nombre, tel: q.cliente.tel || "",
          items: q.items.map((i) => ({ n: i.n, q: i.q, p: i.p })),
          desc: q.desc, iva: !!q.iva, anticipoPct: q.anticipoPct,
          total: t.total, anticipo: t.anticipo
        }
      }));
      const n = Number(String(q.folio).replace(/\D/g, "")) || 0;
      const prevN = Number(await env.KK.get("folio:" + autor)) || 0;
      if (n > prevN) await env.KK.put("folio:" + autor, String(n));
    }

    // Marcar como "Cotización enviada" cuando se mandó el PDF.
    if (q.enviada && !rec.enviada) {
      try { await call("sale.order", "action_quotation_sent", { ids: [rec.id] }); }
      catch { await call("sale.order", "write", { ids: [rec.id], vals: { state: "sent" } }); }
      rec.enviada = true;
      await env.KK.put(syncKey, JSON.stringify(rec));
    }

    return json({ id: rec.id, name: rec.name, enviada: rec.enviada });
  } catch (e) {
    return fail(e.message, 502);
  }
}
