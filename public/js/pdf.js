// PDF de la cotización (jsPDF + autotable + qrcode-generator, todo local para funcionar offline).
import { calc, money } from "./calc.js?v=0.4.9";
import { formatSeal, folioVisible, cleanSeal } from "./canonical.js?v=0.4.9";
import { logError } from "./store.js?v=0.4.9";

let logoData = null;
const ICONOS = ["whatsapp", "telefono", "email", "web", "instagram", "facebook", "tiktok"];
const iconData = {};
const toDataUrl = async (url) => {
  const blob = await (await fetch(url)).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
};
// Imágenes con ?v= (lo cambia bump-version.mjs): si cambian los íconos, el teléfono no reusa los viejos de su caché.
const IMG_V = "?v=0.4.9";
export async function preloadLogo() {
  if (!logoData) logoData = await toDataUrl("/img/logo.png" + IMG_V);
  await Promise.all(ICONOS.filter((k) => !iconData[k]).map(async (k) => { iconData[k] = await toDataUrl(`/img/redes/${k}.png${IMG_V}`); }));
  return logoData;
}
// "@kuukum", "instagram.com/kuukum" o "https://www.facebook.com/kuukum/" -> "/kuukum"
const handle = (v) => "/" + String(v).trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?[a-z]+\.(com|net)\//i, "").replace(/^@/, "").replace(/\/+$/, "");
const site = (v) => String(v).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

const fecha = (d) => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

// Síncrono a propósito: iOS solo permite compartir si se llama dentro del toque del usuario.
export function buildPdf(q, cfg) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const t = calc(q);
  const navy = [0, 44, 55], menta = [94, 209, 195], gris = [110, 126, 128];

  // Encabezado blanco con logo y franja menta
  if (logoData) { try { doc.addImage(logoData, "PNG", M, 26, 64, 64); } catch {} }
  doc.setTextColor(...navy); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("COTIZACIÓN", W - M, 48, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60);
  const rev = Number(q.rev) || 1;
  doc.text(q.folio + (rev > 1 ? "  ·  Revisión " + rev : "") + (q.odoo && q.odoo.name ? "  ·  " + q.odoo.name : ""), W - M, 64, { align: "right" });
  doc.text(fecha(q.fecha), W - M, 78, { align: "right" });
  doc.setFillColor(...menta); doc.rect(0, 102, W, 4, "F");

  // Cliente y vigencia
  let y = 132;
  const vence = new Date(q.fecha); vence.setDate(vence.getDate() + Number(q.vigencia || 15));
  doc.setFontSize(8); doc.setTextColor(...gris);
  doc.text("PREPARADA PARA", M, y); doc.text("VÁLIDA HASTA", W - M, y, { align: "right" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(q.cliente.nombre || "Cliente", M, y + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(fecha(vence), W - M, y + 16, { align: "right" });
  doc.setFontSize(10); doc.setTextColor(60);
  const contacto = [q.cliente.tel && "Tel. " + q.cliente.tel, q.cliente.email].filter(Boolean).join("  ·  ");
  if (contacto) doc.text(contacto, M, y + 30);

  // Partidas
  doc.autoTable({
    startY: y + 48, margin: { left: M, right: M },
    head: [["Cant.", "Descripción", "P. unitario", "Importe"]],
    body: q.items.map((i) => [String(i.q), i.n, money(i.p), money(i.q * i.p)]),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, textColor: 30, lineColor: [217, 226, 226], lineWidth: { bottom: 0.6 } },
    headStyles: { fillColor: [232, 246, 244], textColor: navy, fontStyle: "bold", fontSize: 9 },
    columnStyles: { 0: { halign: "center", cellWidth: 44 }, 2: { halign: "right", cellWidth: 86 }, 3: { halign: "right", cellWidth: 92, fontStyle: "bold" } }
  });

  // Totales
  y = doc.lastAutoTable.finalY + 18;
  const row = (lab, val, big) => {
    doc.setFont("helvetica", big ? "bold" : "normal"); doc.setFontSize(big ? 13 : 10); doc.setTextColor(big ? 0 : 60);
    doc.text(lab, W - M - 120, y, { align: "right" }); doc.text(val, W - M, y, { align: "right" });
    y += big ? 22 : 16;
  };
  row("Subtotal", money(t.sub));
  if (Number(q.desc)) row(`Descuento ${q.desc}%`, "-" + money(t.desc));
  if (q.iva) row("IVA 16%", money(t.iva));
  y += 4; doc.setDrawColor(...menta); doc.setLineWidth(1.5); doc.line(W - M - 220, y - 12, W - M, y - 12);
  row("TOTAL MXN", money(t.total), true);
  if (!q.iva) { doc.setFontSize(8.5); doc.setTextColor(...gris); doc.text("Precios sin IVA.", W - M, y - 6, { align: "right" }); y += 6; }

  // Pago requerido
  y += 8;
  doc.setFillColor(232, 246, 244); doc.roundedRect(M, y, W - 2 * M, 44, 6, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...navy);
  doc.text(`Anticipo ${q.anticipoPct}%: ${money(t.anticipo)}`, M + 14, y + 18);
  doc.setFont("helvetica", "normal"); doc.setTextColor(60);
  doc.text(`Saldo contra entrega: ${money(t.saldo)}`, M + 14, y + 33);
  doc.setFontSize(9);
  doc.text(`${cfg.banco} · CLABE ${cfg.clabe}`, W - M - 14, y + 18, { align: "right" });
  doc.text(`Beneficiario: ${cfg.beneficiario}`, W - M - 14, y + 33, { align: "right" });
  y += 64;

  // Condiciones
  doc.setTextColor(...navy); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Condiciones", M, y); y += 15;
  doc.setFont("helvetica", "normal"); doc.setTextColor(50); doc.setFontSize(9.5);
  const cond = [
    `Tiempo de entrega: ${q.entrega}, a partir de la aprobación del diseño y el anticipo.`,
    `Cotización válida por ${q.vigencia} días. Precios sujetos a disponibilidad de tallas y colores.`,
    cfg.terminos, q.notas
  ].filter(Boolean);
  for (const c of cond) { const tx = doc.splitTextToSize("• " + c, W - 2 * M); doc.text(tx, M, y); y += tx.length * 12 + 3; }

  // Pie: contacto, redes (ícono + /usuario) y sello
  const footTop = H - 104;
  doc.setDrawColor(217, 226, 226); doc.setLineWidth(0.6); doc.line(M, footTop, W - M, footTop);
  const qrSize = 62;
  const maxX = W - M - qrSize - 14;
  doc.setFontSize(9.5); doc.setTextColor(...navy); doc.setFont("helvetica", "bold");
  doc.text(cfg.empresa, M, footTop + 16);
  const items = [
    ["whatsapp", cfg.whatsapp],
    ["telefono", cfg.telefono && cfg.telefono !== cfg.whatsapp ? cfg.telefono : ""],
    ["email", cfg.email],
    ["web", cfg.sitio_web && site(cfg.sitio_web)],
    ["instagram", cfg.instagram && handle(cfg.instagram)],
    ["facebook", cfg.facebook && handle(cfg.facebook)],
    ["tiktok", cfg.tiktok && handle(cfg.tiktok)]
  ].filter(([, v]) => v);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(50);
  const ic = 10, rowH = 15;
  // Ícono y texto centrados en la misma línea: base del texto = centro del ícono + media altura de mayúsculas (Helvetica ≈ 0.72 em).
  const base = ic / 2 + (doc.getFontSize() * 0.72) / 2;
  let fx = M, fy = footTop + 26;
  for (const [k, v] of items) {
    const w = ic + 4 + doc.getTextWidth(v) + 14;
    if (fx + w - 14 > maxX && fx > M) { fx = M; fy += rowH; }
    if (iconData[k]) { try { doc.addImage(iconData[k], "PNG", fx, fy, ic, ic); } catch {} }
    doc.text(v, fx + ic + 4, fy + base);
    fx += w;
  }
  fy += rowH + 10;
  doc.setTextColor(...gris);
  if (cfg.direccion) { doc.text(doc.splitTextToSize(cfg.direccion, maxX - M)[0], M, fy); fy += 12; }
  doc.setFont("courier", "bold"); doc.setFontSize(8.5); doc.setTextColor(...navy);
  doc.text(`Sello de autenticidad: ${folioVisible(q.folio, q.rev)} · ${formatSeal(q.sello)}`, M, Math.max(fy + 2, H - 22));

  // QR de texto plano (no es un enlace): solo Cotiza App lo interpreta, así el cliente no cae en el login de la app.
  try {
    const qr = window.qrcode(0, "M"); qr.addData(qrText(q)); qr.make();
    const n = qr.getModuleCount(), cell = qrSize / n, x0 = W - M - qrSize, y0 = footTop + 10;
    doc.setFillColor(0, 44, 55);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x0 + c * cell, y0 + r * cell, cell + 0.2, cell + 0.2, "F");
  } catch (e) { logError({ tipo: "pdf", mensaje: "QR: " + e.message }); }

  return doc;
}

export const qrText = (q) => `KUUKUM|V1|${folioVisible(q.folio, q.rev)}|${cleanSeal(q.sello)}`;

export function pdfName(q) {
  return `Cotizacion_${folioVisible(q.folio, q.rev)}_${(q.cliente.nombre || "cliente").replace(/[^\wáéíóúñÁÉÍÓÚÑ]+/g, "_")}.pdf`;
}

// PDF en base64 para mandarlo por correo desde Odoo.
export function pdfBase64(q, cfg) {
  return buildPdf(q, cfg).output("datauristring").split(",")[1];
}

// Abre la hoja de compartir (WhatsApp) o descarga si el navegador no puede compartir archivos.
export async function sharePdf(q, cfg) {
  const doc = buildPdf(q, cfg);
  const file = new File([doc.output("blob")], pdfName(q), { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Cotización " + folioVisible(q.folio, q.rev) }); return "shared"; }
    catch (e) { if (e.name === "AbortError") return "cancelled"; logError({ tipo: "compartir", mensaje: `${e.name}: ${e.message}` }); }
  }
  doc.save(pdfName(q));
  return "downloaded";
}
