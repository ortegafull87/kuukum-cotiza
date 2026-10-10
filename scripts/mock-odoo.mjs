// Odoo simulado para pruebas locales: responde POST /json/2/<modelo>/<método> con los métodos que usa la app.
// Uso: node scripts/mock-odoo.mjs [puerto]   (por defecto 8069)
// Ayudas de prueba: GET /__state (todo el estado), POST /__set {model, id, vals} (p. ej. confirmar una cotización),
// POST /__fail {model, method, message} (la siguiente llamada a ese método falla con 500),
// POST /__attach {mode: "empty"} (el siguiente ir.attachment queda en 0 bytes, como pasaba con `datas`).
// ir.attachment se comporta como Odoo 19.3: `datas` no existe (se ignora) y `raw` llega en base64 y se decodifica.
import http from "node:http";

const PORT = Number(process.argv[2]) || 8069;
const db = {
  "res.partner": [
    { id: 1, name: "Grupo Scouts 12", phone: "442 111 2222", email: "ana@scouts12.mx", customer_rank: 1, active: true, parent_id: false },
    { id: 2, name: "Ana López (Scouts 12)", phone: "", email: "ana.lopez@scouts12.mx", customer_rank: 0, active: true, parent_id: 1 },
    { id: 3, name: "Cliente Sin Compras", phone: "442 333 4444", email: "nuevo@ejemplo.mx", customer_rank: 1, active: true, parent_id: false },
    { id: 4, name: "Cliente Con Compras Sin Correo", phone: "442 555 6666", email: false, customer_rank: 1, active: true, parent_id: false }
  ],
  "product.product": [
    { id: 10, display_name: "Playera Unisex Algodón Blanca M Serigrafía Frente", default_code: "PLA-001", list_price: 180, standard_price: 90, taxes_id: [14], sale_ok: true, active: true },
    { id: 11, display_name: "Gorra Bordada Negra", default_code: "GOR-001", list_price: 150, standard_price: 70, taxes_id: [14], sale_ok: true, active: true }
  ],
  "sale.order": [
    // Pedido confirmado de un contacto hijo de Scouts 12 -> Scouts 12 es cliente cautivo.
    { id: 900, name: "S00900", partner_id: 2, state: "sale", amount_total: 1000, order_line: [] },
    { id: 901, name: "S00901", partner_id: 4, state: "sale", amount_total: 500, order_line: [] }
  ],
  "sale.order.line": [], "utm.source": [], "ir.attachment": [], "mail.mail": [], "mail.message": []
};
const seq = { n: 1000 };
const calls = [];
const fails = [];
let attachMode = null;
const rec = (model, id) => db[model].find((r) => r.id === id);
const commercial = (id) => { let p = rec("res.partner", id); while (p && p.parent_id) p = rec("res.partner", p.parent_id); return p ? p.id : id; };
const m2o = (model, id) => (id ? [id, (rec(model, id) || {}).name || (rec(model, id) || {}).display_name || ""] : false);

function match(model, r, domain = []) {
  return domain.every((c) => {
    if (!Array.isArray(c)) return true;
    const [f, op, v] = c;
    const x = r[f];
    switch (op) {
      case "=": return v === false ? !x : x === v;
      case "!=": return v === false ? !!x : x !== v;
      case ">": return x > v;
      case "=ilike": return String(x || "").toLowerCase() === String(v).toLowerCase();
      case "in": return v.includes(x);
      case "child_of": return model === "sale.order" ? commercial(r.partner_id) === commercial(v) : commercial(r.id) === commercial(v);
      default: throw new Error("Operador no simulado: " + op);
    }
  });
}
function out(model, r, fields) {
  const o = { id: r.id };
  for (const f of fields || Object.keys(r)) {
    if (f === "partner_id") o[f] = m2o("res.partner", r.partner_id);
    else if (f === "commercial_partner_id") o[f] = m2o("res.partner", commercial(r.id));
    else o[f] = r[f] ?? false;
  }
  return o;
}
function total(so) {
  const lines = db["sale.order.line"].filter((l) => l.order_id === so.id);
  so.amount_total = Math.round(lines.reduce((a, l) => {
    const base = l.product_uom_qty * l.price_unit * (1 - (l.discount || 0) / 100);
    const tax = (l.tax_ids && l.tax_ids[0] && l.tax_ids[0][2] || []).length ? 0.16 : 0;
    return a + base * (1 + tax);
  }, 0) * 100) / 100;
}
function applyLines(so, cmds) {
  for (const c of cmds || []) {
    if (c[0] === 5) db["sale.order.line"] = db["sale.order.line"].filter((l) => l.order_id !== so.id);
    else if (c[0] === 0) db["sale.order.line"].push({ id: ++seq.n, order_id: so.id, ...c[2] });
  }
  total(so);
}
function err(status, message) { const e = new Error(message); e.status = status; throw e; }

const METHODS = {
  search_read: (m, b) => db[m].filter((r) => match(m, r, b.domain)).slice(0, b.limit || 1e9).map((r) => out(m, r, b.fields)),
  search: (m, b) => db[m].filter((r) => match(m, r, b.domain)).slice(0, b.limit || 1e9).map((r) => r.id),
  search_count: (m, b) => db[m].filter((r) => match(m, r, b.domain)).length,
  read: (m, b) => b.ids.map((id) => rec(m, id)).filter(Boolean).map((r) => out(m, r, b.fields)),
  create: (m, b) => b.vals_list.map((v) => {
    const r = { id: ++seq.n, active: true, ...v };
    if (m === "sale.order") { r.name = "S" + String(r.id).padStart(5, "0"); r.state = "draft"; delete r.order_line; db[m].push(r); applyLines(r, v.order_line); return r.id; }
    if (m === "res.partner") r.parent_id = false;
    if (m === "mail.mail") r.state = "outgoing";
    if (m === "ir.attachment") {
      delete r.datas;                                   // Odoo 19.3 ignora campos desconocidos
      if (r.raw && !/^[A-Za-z0-9+/]*={0,2}$/.test(r.raw)) err(422, "Attachment is not encoded in base64.");
      r.file_size = r.raw ? Buffer.from(r.raw, "base64").length : 0;
      if (attachMode === "empty") { r.file_size = 0; delete r.raw; attachMode = null; }
    }
    db[m].push(r); return r.id;
  }),
  write: (m, b) => {
    for (const id of b.ids) {
      const r = rec(m, id);
      if (m === "sale.order" && ["sale", "cancel"].includes(r.state) && b.vals.order_line) err(422, "No se puede modificar un pedido confirmado");
      const { order_line, ...rest } = b.vals;
      Object.assign(r, rest);
      if (m === "sale.order" && order_line) applyLines(r, order_line);
    }
    return true;
  },
  action_quotation_sent: (m, b) => { for (const id of b.ids) { const r = rec(m, id); if (r.state !== "draft") err(422, "Only draft orders can be marked as sent directly."); r.state = "sent"; } return true; },
  action_draft: (m, b) => { for (const id of b.ids) { const r = rec(m, id); if (["cancel", "sent"].includes(r.state)) r.state = "draft"; } return true; },
  message_post: (m, b) => b.ids.map((id) => {
    const msg = { id: ++seq.n, model: m, res_id: id, body: b.body, body_is_html: !!b.body_is_html, subject: b.subject || false,
      partner_ids: b.partner_ids || [], attachment_ids: b.attachment_ids || [], message_type: b.message_type, subtype_xmlid: b.subtype_xmlid };
    db["mail.message"].push(msg); return msg.id;
  })[0],
  unlink: (m, b) => { db[m] = db[m].filter((r) => !b.ids.includes(r.id)); return true; },
  send: (m, b) => { for (const id of b.ids) rec(m, id).state = "sent"; return null; }
};

http.createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
  let raw = ""; for await (const ch of req) raw += ch;
  if (req.url === "/__state") return send(200, { ...db, calls });
  if (req.url === "/__attach") { attachMode = JSON.parse(raw).mode || null; return send(200, true); }
  if (req.url === "/__fail") { fails.push(JSON.parse(raw)); return send(200, true); }
  if (req.url === "/__set") { const { model, id, vals } = JSON.parse(raw); Object.assign(rec(model, id), vals); return send(200, true); }
  const m = req.url.match(/^\/json\/2\/([\w.]+)\/(\w+)$/);
  if (!m || req.method !== "POST") return send(404, { message: "Ruta no simulada: " + req.url });
  if (!/^bearer .+/i.test(req.headers.authorization || "")) return send(401, { message: "Sin API key" });
  const [, model, method] = m;
  const body = raw ? JSON.parse(raw) : {};
  calls.push({ model, method, body: method === "create" && model === "ir.attachment" ? { n: body.vals_list.length } : body });
  try {
    const f = fails.findIndex((x) => x.model === model && x.method === method);
    if (f >= 0) err(500, fails.splice(f, 1)[0].message || "Fallo simulado");
    if (!db[model]) err(404, "Modelo no simulado: " + model);
    if (!METHODS[method]) err(404, "Método no simulado: " + method);
    send(200, METHODS[method](model, body));
  } catch (e) {
    send(e.status || 500, { message: e.message });
  }
}).listen(PORT, () => console.log(`Odoo simulado en http://localhost:${PORT}`));
