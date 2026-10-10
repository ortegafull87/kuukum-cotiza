// Lector del QR de la cotización: cámara trasera o foto/captura. Decodifica con jsQR (vendor, funciona offline;
// iOS no tiene BarcodeDetector).
import { cleanSeal } from "./canonical.js";

// "KUUKUM|V1|KK-L0012-R2|7F3A9C214B8ED015" (nuevo) o la URL vieja ".../#/verificar/FOLIO/SELLO".
export function parseQr(text) {
  const t = String(text || "").trim();
  let m = t.match(/^KUUKUM\|V1\|([^|\s]+)\|([0-9A-Za-z-]+)$/);
  if (!m) m = t.match(/#\/verificar\/([^/\s]+)\/([^/?#\s]+)/);
  if (!m) return null;
  let folio, sello;
  try { folio = decodeURIComponent(m[1]).toUpperCase(); sello = cleanSeal(decodeURIComponent(m[2])); } catch { return null; }
  return /^KK-/.test(folio) && sello.length === 16 ? { folio, sello } : null;
}

const NO_KUUKUM = "Este código no es de una cotización Kuu Kum";
const SIN_CODIGO = "No encontré un código Kuu Kum en la imagen";

function decode(canvas, inversion = "attemptBoth") {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: inversion });
  return r ? r.data : null;
}
function draw(src, w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Foto o captura (p. ej. del PDF que llegó por WhatsApp). Prueba a dos escalas: el QR del PDF ocupa poco de la página.
export async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    for (const max of [2400, 1200]) {
      const text = decode(draw(img, img.naturalWidth, img.naturalHeight, max));
      if (text) return text;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

let cur = null;   // { el, stream, raf }

// Cierra la cámara (todos los tracks) y quita la vista. Se llama al cancelar, al leer y al salir de la pantalla.
export function closeScanner() {
  if (!cur) return;
  cancelAnimationFrame(cur.raf);
  if (cur.stream) cur.stream.getTracks().forEach((t) => t.stop());
  cur.el.remove();
  cur = null;
}

// onCode({folio, sello}) al leer un código válido; onManual() cuando no hay cámara o se negó el permiso.
export function openScanner({ onCode, onManual }) {
  closeScanner();
  const el = document.createElement("div");
  el.className = "scanner";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Escanear código QR");
  el.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="frame" aria-hidden="true"></div>
    <div class="scan-top"><p>Apunta al código QR del pie de la cotización.</p><div class="scan-msg" role="status" aria-live="polite" hidden></div></div>
    <div class="scan-bottom">
      <button type="button" class="pill block" data-scan="cancel">Cancelar</button>
      <button type="button" class="scan-link" data-scan="file">Usar una foto o captura</button>
      <input type="file" accept="image/*" hidden>
    </div>`;
  document.body.appendChild(el);
  const me = { el, stream: null, raf: 0 };
  cur = me;
  const video = el.querySelector("video"), msgEl = el.querySelector(".scan-msg"), file = el.querySelector("input");
  const say = (m) => { msgEl.textContent = m; msgEl.hidden = !m; };
  let lastBad = "";

  const done = (text) => {
    const p = parseQr(text);
    if (!p) { if (text !== lastBad) { lastBad = text; say(NO_KUUKUM); } return false; }
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch {} }
    closeScanner();
    onCode(p);
    return true;
  };

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-scan]");
    if (!b) return;
    if (b.dataset.scan === "cancel") closeScanner();
    if (b.dataset.scan === "file") file.click();
  });
  file.addEventListener("change", async () => {
    const f = file.files[0]; file.value = "";
    if (!f) return;
    say("Leyendo la imagen…");
    let text = null;
    try { text = await decodeImageFile(f); } catch {}
    if (cur !== me) return;
    if (!text) return say(SIN_CODIGO);
    lastBad = "";
    done(text);
  });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    say("La cámara no está disponible aquí. Usa una foto o captura, o ingresa los datos manualmente.");
    onManual && onManual();
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((stream) => {
    if (cur !== me) { stream.getTracks().forEach((t) => t.stop()); return; }
    me.stream = stream;
    video.srcObject = stream;
    video.play().catch(() => {});
    const tick = () => {
      if (cur !== me) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const text = decode(draw(video, video.videoWidth, video.videoHeight, 720), "dontInvert");   // rápido: cada cuadro
        if (text && done(text)) return;
      }
      me.raf = requestAnimationFrame(tick);
    };
    me.raf = requestAnimationFrame(tick);
  }).catch((e) => {
    if (cur !== me) return;
    say(e && (e.name === "NotAllowedError" || e.name === "SecurityError")
      ? "No hay permiso para usar la cámara. Actívalo en Ajustes → Cotiza → Cámara (en Safari: Ajustes → Apps → Safari → Cámara). Mientras, usa una foto o ingresa los datos manualmente."
      : "No se pudo abrir la cámara. Usa una foto o captura, o ingresa los datos manualmente.");
    onManual && onManual();
  });
}
