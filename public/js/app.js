import { calc, money, r2, parseMoney } from "./calc.js?v=0.3.5";
import { formatSeal, cleanSeal, folioVisible, splitFolio } from "./canonical.js?v=0.3.5";
import { enrich, filter, facetValues, FACETAS } from "./catalog.js?v=0.3.5";
import { ls, api, AuthError, quotes, nextFolio, needsSync, revOf, syncAll, saveSealKey, sign, clearKeys, outbox, flushOutbox, logError } from "./store.js?v=0.3.5";
import { preloadLogo, sharePdf, pdfBase64 } from "./pdf.js?v=0.3.5";
import { openScanner, closeScanner } from "./scanner.js?v=0.3.5";
import { collectDiagnostics, diagText } from "./diagnostics.js?v=0.3.5";

const CLIENT_ID = "273765990336-id4d6tq1b77lqq35si9rk66eb94k16h3.apps.googleusercontent.com";
// Versión: la cambia scripts/bump-version.mjs junto con public/version.json y CACHE de sw.js.
const APP_VERSION = "0.3.5";
const CANALES = [["WA", "WhatsApp"], ["IG", "Instagram"], ["FB", "Facebook"], ["TT", "TikTok"], ["OT", "Otro"]];
const canalName = (c) => (CANALES.find(([k]) => k === c) || [, "—"])[1];
const STEPS = ["Cliente", "Productos", "Condiciones", "Verificar"];
const PANTALLAS = ["Inicio de sesión", "Paso 1 Cliente", "Paso 2 Productos", "Paso 3 Condiciones", "Paso 4 Verificar",
  "Lista de cotizaciones", "Detalle de cotización", "PDF", "Envío por WhatsApp", "Sincronización con Odoo", "Ajustes", "Otro"];
const folioDe = (q) => folioVisible(q.folio, q.rev);

const I = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18l-5-4-5 4z"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-3-7z"/><path d="M11 13l9-9"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  new: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 9v6M9 12h6"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/></svg>',
  qr: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>'
};

// ---------- Estado ----------
const S = {
  user: ls.get("user", null),
  cfg: ls.get("config", null),
  catalog: enrich((ls.get("catalog", null) || { productos: [] }).productos),
  revisar: (ls.get("catalog", null) || { revisar: [] }).revisar || [],
  clientes: (ls.get("clientes", null) || { clientes: [] }).clientes,
  draft: ls.get("draft", null),
  authExpired: false,
  listFilter: "todas", listQuery: "", clientQuery: "", newClient: false, prevRoute: "",
  updateTo: null, sending: false
};
const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet-root");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const saveDraft = () => ls.set("draft", S.draft);

function toast(msg, ms = 2400) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
// Botón con estado de carga: evita el doble toque, muestra spinner + texto y lo restaura al terminar.
async function withLoading(btn, fn, label = "Cargando…") {
  if (btn && btn.dataset.loading) return;
  let html = "";
  if (btn) {
    html = btn.innerHTML;
    btn.dataset.loading = "1"; btn.disabled = true; btn.classList.add("loading"); btn.setAttribute("aria-busy", "true");
    const sp = `<span class="spinner" aria-hidden="true"></span>`;
    btn.innerHTML = btn.classList.contains("act") ? `<span class="c">${sp}</span>${esc(label)}` : `${sp}<span>${esc(label)}</span>`;
  }
  try { return await fn(); }
  catch (e) { logError({ tipo: "accion", mensaje: e.message || String(e) }); toast(e.message || "Algo falló", 3500); }
  finally {
    if (btn) { btn.innerHTML = html; delete btn.dataset.loading; btn.disabled = false; btn.classList.remove("loading"); btn.removeAttribute("aria-busy"); }
  }
}

const route = () => (location.hash || "#/").slice(1);
const go = (h) => { if (location.hash === "#" + h) render(); else location.hash = h; };

// ---------- Barra de estado (iOS, app instalada) ----------
// Algunas apps instaladas con status-bar-style "default" se dibujan bajo la barra y reportan safe-area-inset-top = 0.
// Si pasa (instalada, vertical, a pantalla completa, inset 0), se usa la altura de la barra según la pantalla del iPhone.
const BARRA_IOS = { 568: 20, 667: 20, 736: 20, 812: 47, 844: 47, 852: 59, 874: 62, 896: 48, 926: 47, 932: 59, 956: 62 };
function fixSafeArea() {
  const root = document.documentElement;
  root.style.removeProperty("--safe-top");
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (!instalada || !/iPhone|iPod/.test(navigator.userAgent) || innerHeight < innerWidth) return;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const inset = probe.offsetHeight; probe.remove();
  if (inset > 0 || innerHeight < screen.height - 1) return;   // iOS lo reporta bien, o la app empieza debajo de la barra
  root.style.setProperty("--safe-top", (BARRA_IOS[Math.max(screen.height, screen.width)] || 50) + "px");
}

// ---------- Arranque ----------
async function boot() {
  // "Reparar y recargar" vuelve con ?r=…: se limpia la URL.
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  fixSafeArea();
  window.addEventListener("resize", fixSafeArea);
  preloadLogo().catch(() => {});
  window.addEventListener("error", (e) => logError({ tipo: "js", mensaje: e.message, origen: `${(e.filename || "").replace(location.origin, "")}:${e.lineno}:${e.colno}` }));
  window.addEventListener("unhandledrejection", (e) => logError({ tipo: "promesa", mensaje: (e.reason && (e.reason.message || String(e.reason))) || "rechazo sin motivo" }));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  // Actualizaciones: al abrir, al volver a primer plano (iOS no recarga la app instalada) y cada 30 min.
  checkUpdate();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  setInterval(checkUpdate, 30 * 60000);
  window.addEventListener("hashchange", render);
  window.addEventListener("online", () => { refresh(); renderPill(); });
  window.addEventListener("offline", renderPill);
  setInterval(() => { if (quotes.all().some(needsSync)) runSync(); }, 60000);
  const hadUser = !!S.user;
  if (!hadUser && navigator.onLine && !route().startsWith("/login")) await refresh();
  render();
  if (hadUser) refresh();
}

// ---------- Actualizaciones ----------
async function checkUpdate() {
  if (!navigator.onLine) return null;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) reg.update().catch(() => {});
    const v = (await (await fetch("/version.json", { cache: "no-store" })).json()).version;
    S.updateTo = v && v !== APP_VERSION ? v : null;
    renderBanner();
    return v;
  } catch { return null; }
}
function renderBanner() {
  const el = document.getElementById("update-banner");
  if (!el) return;
  const show = !!S.updateTo && !S.sending;        // no interrumpir un envío del Paso 4
  el.hidden = !show;
  document.body.classList.toggle("has-update", show);
  if (show) el.innerHTML = `<span>Hay una versión nueva de Cotiza App</span><button class="pill" data-act="applyUpdate">Actualizar</button>`;
}
// Si hay un service worker en espera, se activa y luego se recarga; si no, solo se recarga.
// Antes de recargar se intenta subir lo pendiente (máx. 5 s, sin bloquear). Se recarga una sola vez: al llegar
// controllerchange o a los 3 s, lo que pase primero.
let recargando = false;
async function applyUpdate() {
  if (quotes.all().some(needsSync) && navigator.onLine) {
    await Promise.race([runSync().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  }
  const recargar = () => { if (recargando) return; recargando = true; location.reload(); };
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg && reg.waiting) {
    navigator.serviceWorker.addEventListener("controllerchange", recargar, { once: true });
    reg.waiting.postMessage("SKIP_WAITING");
    setTimeout(recargar, 3000);
  } else recargar();
  await new Promise(() => {});   // el botón sigue en "Actualizando…" hasta que la página se recargue
}

// manual: lo pidió el usuario (Actualizar catálogo y clientes) y debe enterarse si falla.
async function refresh(manual = false) {
  if (!navigator.onLine) return;
  try {
    const me = await api("me");
    await saveSealKey(me.email, me.sealKey);
    delete me.sealKey;
    S.user = me; ls.set("user", me); S.authExpired = false;
    const [cfg, cat, cli] = await Promise.all([api("config"), api("catalogo"), api("clientes")]);
    S.cfg = cfg; ls.set("config", cfg);
    ls.set("catalog", cat); S.catalog = enrich(cat.productos); S.revisar = cat.revisar || [];
    ls.set("clientes", cli); S.clientes = cli.clientes;
    if (!route() || route() === "/" ) go("/nueva");
    await runSync();
  } catch (e) {
    if (e instanceof AuthError) {
      if (!S.user) { go("/login"); return; }
      S.authExpired = true; render();
    }
    if (manual) throw e;
  }
}
async function runSync() {
  const r = await syncAll(() => { renderPill(); if (route().startsWith("/cotizaciones") || route().startsWith("/cotizacion/")) render(); },
    { pdfBase64: (q) => pdfBase64(q, S.cfg || {}) });
  if (r && r.auth) { S.authExpired = true; render(); }
  if (r && !r.skipped && !r.auth) {
    const ids = await flushOutbox();
    if (ids.length) toast(ids.length === 1 ? `Reporte ${ids[0]} enviado. Gracias.` : `Reportes ${ids.join(", ")} enviados. Gracias.`, 3500);
  }
  renderPill();
  return r;
}

// ---------- Render principal ----------
function render() {
  renderRoute();
  // Primera pantalla pintada: cancela la red de seguridad de index.html ("No se pudo cargar Cotiza App").
  if (!window.__kkBooted) {
    window.__kkBooted = true;
    clearTimeout(window.__kkRescue);
    const r = document.getElementById("kk-rescue"); if (r) r.remove();
  }
}
function renderRoute() {
  const r = route();
  closeSheet(); closeScanner();
  if (r.startsWith("/login") || (!S.user && !r.startsWith("/verificar"))) return renderLogin();
  if (!S.cfg) S.cfg = {};
  if (r.startsWith("/reportar")) return renderReport();
  S.prevRoute = r; RP.hecho = null;
  if (r.startsWith("/nueva")) return renderWizard();
  if (r.startsWith("/cotizacion/")) return renderDetail(decodeURIComponent(r.split("/")[2]));
  if (r.startsWith("/ajustes")) return renderSettings();
  if (r.startsWith("/registro")) return renderServerLog();
  if (r.startsWith("/verificar")) return renderVerify(r.split("/").slice(2).map(decodeURIComponent));
  return renderList();
}

function pillHtml() {
  const pend = quotes.all().filter(needsSync);
  const err = pend.filter((q) => q.sync === "error").length;
  if (!navigator.onLine) return `<button class="sync-pill" data-act="sync"><span class="dot"></span>Sin internet${pend.length ? " · " + pend.length : ""}</button>`;
  if (err) return `<button class="sync-pill err" data-act="sync"><span class="dot"></span>${err} con error</button>`;
  if (pend.length) return `<button class="sync-pill pend" data-act="sync"><span class="dot"></span>${pend.length} por subir</button>`;
  return `<button class="sync-pill" data-act="sync">${I.check.replace("<svg", '<svg width="16" height="16"')} Al día</button>`;
}
function renderPill() { const el = document.getElementById("pill"); if (el) el.innerHTML = pillHtml(); }

const tabbar = (on) => `
  <nav class="tabbar">
    <button class="tab ${on === "nueva" ? "on" : ""}" data-act="nav" data-to="/nueva">${I.new}Nueva</button>
    <button class="tab ${on === "lista" ? "on" : ""}" data-act="nav" data-to="/cotizaciones">${I.doc}Cotizaciones</button>
  </nav>`;
const authBanner = () => S.authExpired ? `<div class="notice">Tu sesión venció. Las cotizaciones se guardan, pero no suben a Odoo hasta que entres de nuevo. <button class="pill soft" style="margin-top:8px;height:40px" data-act="nav" data-to="/login">Entrar con Google</button></div>` : "";

// ---------- Login ----------
function renderLogin() {
  const err = new URLSearchParams(route().split("?")[1] || "").get("e");
  const msg = !err ? "" : err === "csrf" || err === "token"
    ? "No se pudo validar el inicio de sesión. Inténtalo otra vez."
    : `La cuenta ${esc(err)} no tiene acceso a Kuukum Cotiza.`;
  $app.innerHTML = `
    <div class="login"><div class="box">
      <img src="/img/logo.png" alt="Kuukum">
      <div><h1 style="margin:0 0 6px;font-size:24px">Cotiza App</h1><p>Entra con tu cuenta de Google autorizada.</p></div>
      ${msg ? `<div class="notice">${msg}</div>` : ""}
      ${navigator.onLine ? `<div id="gbtn" style="min-height:44px"></div>` : `<div class="notice info">Necesitas internet para entrar. Después la app funciona sin conexión.</div>`}
      ${S.user ? `<button class="pill" data-act="nav" data-to="/cotizaciones">Seguir sin conexión</button>` : ""}
    </div></div>`;
  if (!navigator.onLine) return;
  const init = () => {
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID, ux_mode: "redirect", login_uri: location.origin + "/api/auth/google", auto_select: false
    });
    window.google.accounts.id.renderButton(document.getElementById("gbtn"),
      { theme: matchMedia("(prefers-color-scheme: dark)").matches ? "filled_black" : "outline", size: "large", shape: "pill", text: "signin_with", locale: "es", width: 280 });
  };
  if (window.google && window.google.accounts) return init();
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = init;
  document.head.appendChild(s);
}

// ---------- Asistente ----------
function newDraft(base = {}) {
  const c = S.cfg || {};
  return {
    uuid: crypto.randomUUID(), folio: null, fecha: new Date().toISOString(), creadoPor: S.user.email,
    cliente: { odooId: null, nombre: "", tel: "", email: "" }, canal: "WA",
    items: [], desc: 0, iva: false,
    anticipoPct: Number(c.anticipo_pct ?? 60), entrega: c.entrega_texto || "5 a 7 días hábiles",
    vigencia: Number(c.vigencia_dias ?? 15), notas: "", estado: "borrador", step: 1, ...base
  };
}
// Motivo concreto por el que no se puede avanzar ("" si todo está bien). Se muestra arriba de los botones.
const corto = (s) => { const t = String(s || "").trim(); return t.length > 28 ? t.slice(0, 27) + "…" : t; };
function stepIssue(n, d = S.draft) {
  if (n === 1) return (d.cliente.nombre || "").trim() ? "" : "Elige o crea un cliente";
  if (n === 2) {
    if (!d.items.length) return "Agrega al menos un producto";
    for (const [k, i] of d.items.entries()) {
      const nom = corto(i.n);
      if (!nom) return `Escribe la descripción de la partida ${k + 1}`;
      if (!(Number(i.q) > 0)) return `La cantidad de «${nom}» debe ser mayor a 0`;
      if (!(Number(i.p) > 0)) return `Falta el precio de «${nom}»`;
    }
  }
  if (n === 3 && !(Number(d.anticipoPct) >= 0 && Number(d.anticipoPct) <= 100)) return "El anticipo debe estar entre 0 y 100%";
  return "";
}
const stepValid = (n, d = S.draft) => !stepIssue(n, d);

function renderWizard() {
  if (!S.draft) { S.draft = newDraft(); saveDraft(); }
  const d = S.draft, n = d.step || 1;
  $app.innerHTML = `
    <div class="screen">
      <header class="wiz-head">
        <div class="row"><h1>${d.editOf ? "Editar cotización" : "Nueva cotización"}</h1>${d.folio ? `<span class="num muted small">${esc(folioDe(d))}</span>` : ""}
          <button class="icon-btn lock" data-act="logout" aria-label="Cerrar sesión">${I.lock}</button></div>
        <div class="progress">${STEPS.map((_, i) => `<span class="${i < n ? "on" : ""}"></span>`).join("")}</div>
        <div class="step-name">Paso ${n} de 4 · ${STEPS[n - 1]}</div>
      </header>
      <main class="content" id="step">${[0, stepCliente, stepProductos, stepCondiciones, stepVerificar][n]()}</main>
      <div class="actions" id="wizact"><div class="why" id="why" role="status" aria-live="polite" ${n < 4 && stepIssue(n) ? "" : "hidden"}>${n < 4 ? esc(stepIssue(n)) : ""}</div>${wizActions(n)}</div>
    </div>`;
  if (n === 4) prepareSeal();
}
function wizActions(n) {
  const back = n > 1 ? `<button class="act ghost" data-act="step" data-to="${n - 1}"><span class="c">${I.back}</span>Atrás</button>` : "";
  const discard = `<button class="act ghost" data-act="discard"><span class="c">${I.x}</span>Descartar</button>`;
  if (n < 4) {
    return back + discard +
      `<button class="act ghost" data-act="saveDraft"><span class="c">${I.save}</span>Borrador</button>` +
      `<button class="act" data-act="step" data-to="${n + 1}" ${stepValid(n) ? "" : "disabled"} id="nextbtn"><span class="c">${I.next}</span>Siguiente</button>`;
  }
  return back +
    `<button class="act ghost" data-act="finish" data-send="0" id="savebtn" disabled><span class="c">${I.save}</span>Guardar</button>` +
    `<button class="act wide" data-act="finish" data-send="1" id="sendbtn" disabled><span class="c">${I.send} Enviar PDF</span>Guarda y comparte</button>`;
}
function refreshNext() {
  const b = document.getElementById("nextbtn");
  if (!b) return;
  const why = stepIssue(S.draft.step);
  b.disabled = !!why;
  const w = document.getElementById("why");
  if (w) { w.textContent = why; w.hidden = !why; }
}

// Paso 1: cliente
function stepCliente() {
  const d = S.draft, c = d.cliente;
  const picked = c.nombre && !S.newClient;
  return `
    ${picked ? `
      <div class="picked"><div class="grow"><b>${esc(c.nombre)}</b><span class="muted num small">${esc(c.tel || c.email || (c.odooId ? "Cliente de Odoo" : "Cliente nuevo"))}</span></div>
        <span class="check">${I.check}</span></div>
      <button class="pill ghost" data-act="clearClient">Cambiar cliente</button>` : S.newClient ? `
      <div class="card"><h3>Cliente nuevo</h3>
        <label class="field">Nombre o empresa<input id="nc-nombre" value="${esc(c.nombre)}" autocomplete="off" placeholder="Ej. Grupo Scouts 12"></label>
        <label class="field">WhatsApp / teléfono<input id="nc-tel" value="${esc(c.tel)}" inputmode="tel" autocomplete="off" placeholder="442 000 0000"></label>
        <label class="field">Correo (opcional)<input id="nc-email" value="${esc(c.email)}" inputmode="email" autocomplete="off"></label>
        <div class="grid2"><button class="pill ghost" data-act="cancelNew">Buscar en Odoo</button><button class="pill" data-act="useNew">Usar cliente</button></div>
      </div>` : `
      <label class="search">${I.search}<input id="cq" placeholder="Nombre o teléfono…" value="${esc(S.clientQuery)}" autocomplete="off" autocapitalize="words"></label>
      <div class="list" id="clist">${clientResults()}</div>
      <div class="divider">o</div>
      <button class="pill soft" data-act="newClient">+ Cliente nuevo</button>`}
    <div class="facet"><span class="label">Canal</span>
      <div class="chips wrap">${CANALES.map(([k, v]) => `<button class="chip ${d.canal === k ? "on" : ""}" data-act="canal" data-v="${k}">${v}</button>`).join("")}</div>
    </div>`;
}
function clientResults() {
  const q = S.clientQuery.trim();
  const pool = clientPool();
  if (!q) return pool.length ? `<div class="muted small" style="padding:8px 2px">${S.clientes.length} cliente${S.clientes.length === 1 ? "" : "s"} de Odoo. Escribe para buscar.</div>` : `<div class="empty">Sin clientes descargados todavía.</div>`;
  const N = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qd = q.replace(/\D/g, ""), qn = N(q);
  const hits = pool.filter((c) => N(c.nombre).includes(qn) || (qd.length >= 3 && String(c.tel).replace(/\D/g, "").includes(qd))).slice(0, 30);
  if (!hits.length) return `<div class="empty">Sin coincidencias. Crea un cliente nuevo.</div>`;
  return hits.map((c, i) => `<button class="li" data-act="pickClient" data-i="${pool.indexOf(c)}"><div class="grow"><div class="t">${esc(c.nombre)}</div><div class="s num">${esc(c.tel || c.email || "")}</div></div></button>`).join("");
}
function clientPool() {
  const local = quotes.all().filter((x) => !x.cliente.odooId).map((x) => ({ id: null, nombre: x.cliente.nombre, tel: x.cliente.tel, email: x.cliente.email }));
  return [...S.clientes, ...local.filter((l, i, a) => a.findIndex((y) => y.nombre === l.nombre && y.tel === l.tel) === i)];
}

// Paso 2: productos
function stepProductos() {
  const d = S.draft;
  return `
    ${d.items.map((it, k) => lineCard(it, k)).join("")}
    <button class="dashed" data-act="openSheet">${I.plus}<span>${d.items.length ? "Agregar otro producto" : "Configura un nuevo producto"}</span></button>
    <button class="pill ghost" data-act="addFree">+ Producto libre (fuera de catálogo)</button>
    ${d.items.length ? `<div class="card" id="mini">${miniTotals()}</div>` : ""}`;
}
function lineCard(it, k) {
  return `
    <div class="line ${Number(it.p) > 0 ? "" : "warn"}" data-k="${k}">
      <input class="name field" data-f="n" value="${esc(it.n)}" aria-label="Descripción" style="border:0;border-bottom:1.5px solid var(--line);background:none;min-height:40px;font-weight:600;font-size:15px;outline:none;width:100%">
      <div class="row">
        <div class="stepper">
          <button data-act="qty" data-d="-1" aria-label="Menos">${I.minus}</button>
          <input data-f="q" inputmode="numeric" value="${it.q}" aria-label="Cantidad">
          <button data-act="qty" data-d="1" aria-label="Más">${I.plus}</button>
        </div>
        <label class="field">Precio unit.<input class="num" data-f="p" inputmode="decimal" value="${it.p}"></label>
        <label class="field">Tu costo<input class="num" data-f="c" inputmode="decimal" value="${it.c}"></label>
      </div>
      <div class="foot"><button class="link-del" data-act="delLine">Quitar</button>
        <span class="lf">Ganas ${money(it.q * (it.p - it.c))} · <b class="num">${money(it.q * it.p)}</b></span></div>
    </div>`;
}
function miniTotals() {
  const t = calc(S.draft);
  return `<div class="kv"><span>Subtotal</span><span class="num">${money(t.sub)}</span></div>
    <div class="kv"><span>Tu ganancia</span><span class="num">${money(t.ganancia)} ${marginBadge(t.margen)}</span></div>`;
}
const marginBadge = (m) => `<span class="badge ${m >= 45 ? "b-ok" : m >= 30 ? "b-warn" : "b-bad"}">${Math.round(m)}%</span>`;

// Paso 3: condiciones
function stepCondiciones() {
  const d = S.draft;
  return `
    <div class="card"><h3>Descuento por volumen</h3>
      <div class="chips wrap">${[0, 5, 10, 15, 20].map((v) => `<button class="chip ${Number(d.desc) === v ? "on" : ""}" data-act="desc" data-v="${v}">${v ? v + "%" : "Sin descuento"}</button>`).join("")}</div>
    </div>
    <div class="card">
      <label class="toggle">Agregar IVA 16%<input type="checkbox" id="iva" ${d.iva ? "checked" : ""}></label>
      <div class="grid2">
        <label class="field">Anticipo %<input class="num" id="anticipoPct" inputmode="numeric" value="${esc(d.anticipoPct)}"></label>
        <label class="field">Vigencia (días)<input class="num" id="vigencia" inputmode="numeric" value="${esc(d.vigencia)}"></label>
      </div>
      <label class="field">Tiempo de entrega<input id="entrega" value="${esc(d.entrega)}"></label>
      <label class="field">Notas para el cliente<textarea id="notas" rows="3" placeholder="Ej. Incluye diseño. Tallas por confirmar.">${esc(d.notas)}</textarea></label>
    </div>
    <div class="card" id="mini3">${totalsBlock(d)}</div>`;
}
function totalsBlock(q) {
  const t = calc(q);
  return `
    <div class="kv"><span>Subtotal</span><span class="num">${money(t.sub)}</span></div>
    ${Number(q.desc) ? `<div class="kv"><span>Descuento ${q.desc}%</span><span class="num">−${money(t.desc)}</span></div>` : ""}
    ${q.iva ? `<div class="kv"><span>IVA 16%</span><span class="num">${money(t.iva)}</span></div>` : ""}
    <div class="kv big"><span>Total</span><span class="num">${money(t.total)}</span></div>
    ${q.iva ? "" : `<div class="muted small">Precios sin IVA</div>`}`;
}

// Paso 4: verificar
function stepVerificar() {
  const d = S.draft, t = calc(d);
  return `
    <div class="card"><h3>Cliente</h3>
      <div><b style="font-size:17px">${esc(d.cliente.nombre)}</b><div class="muted small">${esc([d.cliente.tel, d.cliente.email].filter(Boolean).join(" · "))} · ${canalName(d.canal)}</div></div>
    </div>
    <div class="card"><h3>Productos</h3>
      ${d.items.map((i) => `<div class="kv"><span>${i.q} × ${esc(i.n)}</span><span class="num">${money(i.q * i.p)}</span></div>`).join("")}
    </div>
    <div class="card"><h3>Totales</h3>${totalsBlock(d)}</div>
    <div class="card"><h3>Pago requerido</h3>
      <div class="kv"><span>Anticipo ${d.anticipoPct}%</span><span class="num" style="color:var(--ok);font-weight:700">${money(t.anticipo)}</span></div>
      <div class="kv"><span>Saldo contra entrega</span><span class="num">${money(t.saldo)}</span></div>
    </div>
    <div class="card"><h3>Condiciones</h3>
      <div class="kv"><span>Entrega</span><span>${esc(d.entrega)}</span></div>
      <div class="kv"><span>Vigencia</span><span>${esc(d.vigencia)} días</span></div>
      ${d.notas ? `<div class="muted small">${esc(d.notas)}</div>` : ""}
    </div>
    ${correoPaso4(d)}
    <div class="profit"><div><small>Tu ganancia (no sale en el PDF)</small><b>${money(t.ganancia)}</b><small>Costo ${money(t.costo)}</small></div>${marginBadge(t.margen)}</div>
    <div class="muted small num" id="sealline">Generando sello…</div>`;
}
// Correo solo para clientes cautivos (≥1 pedido confirmado y con correo). El servidor lo vuelve a validar.
function clienteOdoo(c) { return c && c.odooId ? S.clientes.find((x) => x.id === c.odooId) : null; }
function correoCliente(c) { const o = clienteOdoo(c); return (o && o.email) || (c && c.email) || ""; }
function esCautivo(c) {
  const o = clienteOdoo(c);
  return !!(o ? o.cautivo : c && c.odooId && c.cautivo && c.email);
}
const SIN_CORREO = `<div class="muted small">Correo disponible para clientes con al menos una compra.</div>`;
function correoPaso4(d) {
  if (!esCautivo(d.cliente)) return SIN_CORREO;
  return `<div class="card"><label class="toggle"><span>Enviar también por correo a <b>${esc(correoCliente(d.cliente))}</b></span>
    <input type="checkbox" id="porCorreo" ${d.porCorreo ? "checked" : ""}></label></div>`;
}
async function prepareSeal() {
  const d = S.draft;
  try {
    if (!d.folio) d.folio = nextFolio(S.user);
    d.fecha = new Date().toISOString();
    d.creadoPor = S.user.email;
    d.sello = await sign(d);
    saveDraft();
    const el = document.getElementById("sealline");
    if (el) el.innerHTML = `${I.shield.replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"')} Sello ${esc(folioDe(d))} · ${formatSeal(d.sello)}`;
    ["savebtn", "sendbtn"].forEach((id) => { const b = document.getElementById(id); if (b) b.disabled = false; });
  } catch (e) {
    const el = document.getElementById("sealline");
    if (el) el.innerHTML = `<div class="notice">${esc(e.message)}</div>`;
  }
}

// ---------- Configurador de producto (hoja inferior) ----------
const SH = { sel: {}, text: "", pick: null, q: 1 };
function openSheet() {
  Object.assign(SH, { sel: {}, text: "", pick: null, q: 1 });
  drawSheet();
}
function closeSheet() { $sheet.innerHTML = ""; }
function drawSheet(keepFocus) {
  const pool = filter(S.catalog, SH.sel, SH.text);
  const vals = facetValues(pool);
  const results = pool.slice(0, 60);
  if (!SH.pick && pool.length === 1) SH.pick = pool[0].id;   // si solo queda uno, ya está elegido
  const scroll = $sheet.querySelector(".body")?.scrollTop || 0;
  $sheet.innerHTML = `
    <div class="backdrop" data-act="closeSheet"></div>
    <div class="sheet" role="dialog" aria-label="Configura un producto">
      <div class="grab"></div>
      <h2>¡Okie Dokie!</h2>
      <div class="body">
        <label class="search">${I.search}<input id="sq" placeholder="Buscar en el catálogo…" value="${esc(SH.text)}" autocomplete="off"></label>
        ${FACETAS.map(([k, label]) => {
          const opts = vals[k];
          if (!opts.length && !SH.sel[k]) return "";
          const list = SH.sel[k] && !opts.includes(SH.sel[k]) ? [SH.sel[k], ...opts] : opts;
          return `<div class="facet"><span class="label">${label}</span><div class="chips">${list.map((v) =>
            `<button class="chip ${SH.sel[k] === v ? "on" : ""}" data-act="facet" data-k="${k}" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div></div>`;
        }).join("")}
        <div class="label">${pool.length} producto${pool.length === 1 ? "" : "s"}${SH.pick ? "" : " · toca uno para elegirlo"}</div>
        <div style="display:grid;gap:8px">${results.map((p) => {
          const m = p.p > 0 ? Math.round(((p.p - p.c) / p.p) * 100) : 0;
          return `<button class="res ${SH.pick === p.id ? "on" : ""}" data-act="pickProd" data-id="${p.id}"><span class="grow">${esc(p.n)}</span><span style="text-align:right"><span class="p">${money(p.p)}</span><br><span class="m">${m}%</span></span></button>`;
        }).join("") || `<div class="empty">Nada con esos filtros. Quita un chip o usa "Producto libre".</div>`}</div>
      </div>
      <div class="foot">
        <div class="stepper">
          <button data-act="sheetQty" data-d="-1" aria-label="Menos">${I.minus}</button>
          <input id="sheetq" inputmode="numeric" value="${SH.q}" aria-label="Cantidad">
          <button data-act="sheetQty" data-d="1" aria-label="Más">${I.plus}</button>
        </div>
        <button class="pill" data-act="addPicked" ${SH.pick ? "" : "disabled"} style="${SH.pick ? "" : "opacity:.45"}">¡Listo!</button>
      </div>
    </div>`;
  const body = $sheet.querySelector(".body"); if (body) body.scrollTop = scroll;
  if (keepFocus) { const i = document.getElementById("sq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

// ---------- Lista ----------
function statusChip(q) {
  if (q.sync === "conflicto") return `<span class="st err">Ya es pedido</span>`;
  if (q.sync === "error") return `<span class="st err">Error al subir</span>`;
  if (!q.odoo) return `<span class="st pend">Por subir</span>`;
  if (revOf(q) > (q.odoo.rev || 1)) return `<span class="st pend">${esc(q.odoo.name)} · R${revOf(q)} por subir</span>`;
  if (q.enviada && !q.odoo.enviada) return `<span class="st pend">${esc(q.odoo.name)} · por marcar</span>`;
  return `<span class="st ok">${esc(q.odoo.name)} ✓</span>`;
}
function renderList() {
  const all = quotes.all();
  const N = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qq = N(S.listQuery);
  const list = all.filter((q) => {
    if (S.listFilter === "pend" && !needsSync(q)) return false;
    if (S.listFilter === "env" && !q.enviada) return false;
    if (S.listFilter === "err" && q.sync !== "error") return false;
    return !qq || N(q.cliente.nombre + " " + folioDe(q) + " " + (q.odoo ? q.odoo.name : "")).includes(qq);
  });
  const d = S.draft;
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><img src="/img/logo.png" alt=""><h1>Cotizaciones</h1><span id="pill">${pillHtml()}</span>
        <button class="icon-btn" data-act="nav" data-to="/ajustes" aria-label="Ajustes">${I.gear}</button></header>
      <main class="content">
        ${authBanner()}
        ${d && (d.cliente.nombre || d.items.length) ? `<button class="qcard" data-act="nav" data-to="/nueva" style="background:var(--accent-soft);border-radius:var(--r);padding:14px">
          <div class="r1"><span class="folio">${d.editOf ? "Editando " + esc(folioDe(d)) : "Borrador en curso"}</span><span class="st draft">Paso ${d.step} de 4</span></div>
          <div class="muted">${esc(d.cliente.nombre || "Sin cliente")} · ${d.items.length} producto(s)</div></button>` : ""}
        <label class="search">${I.search}<input id="lq" placeholder="Buscar cliente o folio" value="${esc(S.listQuery)}" autocomplete="off"></label>
        <div class="chips">${[["todas", "Todas"], ["pend", "Por subir"], ["env", "Enviadas"], ["err", "Con error"]].map(([k, v]) =>
          `<button class="chip ${S.listFilter === k ? "on" : ""}" data-act="lf" data-v="${k}">${v}</button>`).join("")}</div>
        <div id="qlist">${list.length ? list.map((q) => {
          const t = calc(q), pzs = q.items.reduce((a, i) => a + Number(i.q), 0);
          return `<button class="qcard" data-act="nav" data-to="/cotizacion/${q.uuid}">
            <div class="r1"><span class="folio">${esc(q.folio)}${revOf(q) > 1 ? ` · R${revOf(q)}` : ""}</span>${statusChip(q)}</div>
            <div class="muted">${esc(q.cliente.nombre)} · ${canalName(q.canal)}</div>
            <div class="r3"><span class="muted small">${pzs} pza${pzs === 1 ? "" : "s"} · ${new Date(q.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}${q.enviada ? " · Enviada" : ""}</span><span class="total">${money(t.total)}</span></div>
          </button>`;
        }).join("") : `<div class="empty">${all.length ? "Nada con ese filtro." : "Aún no hay cotizaciones. Toca <b>Nueva</b> para empezar."}</div>`}</div>
      </main>
      ${tabbar("lista")}
    </div>`;
}

// ---------- Detalle ----------
function renderDetail(uuid) {
  const q = quotes.get(uuid);
  if (!q) return go("/cotizaciones");
  const t = calc(q);
  const odooLink = q.odoo && S.user.odooUrl ? `${S.user.odooUrl}/odoo/sales/${q.odoo.id}` : "";
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><button class="icon-btn" data-act="nav" data-to="/cotizaciones" aria-label="Volver a cotizaciones">${I.back}</button>
        <h1 class="num">${esc(folioDe(q))}</h1><span id="pill">${pillHtml()}</span></header>
      <main class="content">
        <div class="card">
          <div class="kv"><b style="font-size:18px">${esc(q.cliente.nombre)}</b>${statusChip(q)}</div>
          <div class="muted small">${canalName(q.canal)} · ${new Date(q.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}${q.enviada ? " · Enviada" : " · Guardada"}</div>
          ${revOf(q) > 1 ? `<div class="muted small">Revisión ${revOf(q)}${(q.historial || []).map((h) => ` · R${h.rev} ${money(h.total)}`).join("")}</div>` : ""}
          ${q.sync === "error" ? `<div class="notice">No subió a Odoo: ${esc(q.syncError)}</div>` : ""}
          ${q.sync === "conflicto" ? `<div class="notice">${esc(q.syncError)}</div>
            <div class="grid2"><button class="pill soft" data-act="dup" data-uuid="${q.uuid}">Duplicar como nueva</button>
              ${q.revPrev ? `<button class="pill ghost" data-act="undoRev" data-uuid="${q.uuid}">Descartar R${revOf(q)}</button>` : ""}</div>` : ""}
        </div>
        <div class="card"><h3>Productos</h3>
          ${q.items.map((i) => `<div class="kv"><span>${i.q} × ${esc(i.n)}</span><span class="num">${money(i.q * i.p)}</span></div>`).join("")}
        </div>
        <div class="card"><h3>Totales</h3>${totalsBlock(q)}</div>
        <div class="card"><h3>Pago requerido</h3>
          <div class="kv"><span>Anticipo ${q.anticipoPct}%</span><span class="num" style="color:var(--ok);font-weight:700">${money(t.anticipo)}</span></div>
          <div class="kv"><span>Saldo</span><span class="num">${money(t.saldo)}</span></div>
        </div>
        <div class="profit"><div><small>Tu ganancia</small><b>${money(t.ganancia)}</b></div>${marginBadge(t.margen)}</div>
        <div class="muted small num">${I.shield.replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"')} Sello ${esc(folioDe(q))} · ${formatSeal(q.sello)}</div>
        <button class="pill block" data-act="resend" data-uuid="${q.uuid}">${q.enviada ? "Reenviar PDF" : "Enviar PDF"}</button>
        ${correoDetalle(q)}
        <div class="grid2">
          ${q.sync === "conflicto" ? "" : `<button class="pill soft" data-act="edit" data-uuid="${q.uuid}">Editar</button>`}
          <button class="pill soft" data-act="dup" data-uuid="${q.uuid}">Duplicar</button>
        </div>
        <button class="pill soft block" data-act="text" data-uuid="${q.uuid}">Mandar como texto</button>
        ${q.sync === "error" ? `<button class="pill ghost block" data-act="sync" data-label="Subiendo…">Reintentar subida</button>` : ""}
        ${odooLink ? `<a class="pill ghost block" style="display:grid;place-items:center;text-decoration:none" href="${odooLink}" target="_blank" rel="noopener">Abrir ${esc(q.odoo.name)} en Odoo</a>` : ""}
        <button class="pill block" data-act="nav" data-to="/cotizaciones">Volver a cotizaciones</button>
      </main>
    </div>`;
}

function correoDetalle(q) {
  if (!esCautivo(q.cliente)) return SIN_CORREO;
  const cuando = (f) => new Date(f).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const ya = q.correo && q.correo.rev === revOf(q);
  return `
    ${q.correoPend ? `<div class="notice info">Correo en cola para ${esc(correoCliente(q.cliente))}. Se manda en cuanto la cotización esté en Odoo.</div>` : ""}
    ${q.correoError ? `<div class="notice">Correo: ${esc(q.correoError)}</div>` : ""}
    ${q.correo ? `<div class="muted small">Enviado por correo el ${cuando(q.correo.fecha)} a ${esc(q.correo.email)}${q.correo.rev !== revOf(q) ? ` (R${q.correo.rev})` : ""}</div>` : ""}
    <button class="pill soft block" data-act="mail" data-uuid="${q.uuid}" ${q.correoPend ? "disabled" : ""}>${ya ? "Reenviar por correo" : "Enviar por correo"}</button>`;
}

// ---------- Ajustes ----------
const CFG_FIELDS = [
  ["Empresa", [["empresa", "Nombre comercial"], ["titular", "Titular"], ["rfc", "RFC"]]],
  ["Contacto en el PDF", [["email", "Correo", "email"], ["telefono", "Teléfono", "tel"], ["whatsapp", "WhatsApp", "tel"], ["sitio_web", "Sitio web"],
    ["instagram", "Instagram (usuario)"], ["facebook", "Facebook (usuario)"], ["tiktok", "TikTok (usuario)"], ["direccion", "Dirección"]]],
  ["Pago", [["banco", "Banco"], ["clabe", "CLABE"], ["beneficiario", "Beneficiario"], ["anticipo_pct", "Anticipo por defecto %", "numeric"]]],
  ["Condiciones por defecto", [["entrega_texto", "Tiempo de entrega"], ["vigencia_dias", "Vigencia (días)", "numeric"], ["terminos", "Términos y condiciones", "area"]]],
  ["Correo", [["correo_cotizacion", "Mensaje del correo de cotización", "area", "Puedes usar {cliente}, {folio}, {total}, {vigencia} y {whatsapp}. Solo se manda a clientes con al menos una compra."],
    ["correo_remitente", "Remitente de los correos (dirección de Odoo)", "email", "Debe ser del dominio de Odoo (p. ej. notifications@kuukum.odoo.com) para no caer en spam."]]],
  ["Acceso", [["usuarios_permitidos", "Correos con acceso (uno por línea)", "area"]]]
];
function renderSettings() {
  const c = S.cfg || {};
  const users = c.usuarios_permitidos || "loidaegr@gmail.com\nortegafull87@gmail.com\nkuukum.mx@gmail.com";
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><button class="icon-btn" data-act="nav" data-to="/cotizaciones" aria-label="Volver a cotizaciones">${I.back}</button><h1>Ajustes</h1></header>
      <main class="content settings">
        ${!navigator.onLine ? `<div class="notice info">Sin internet: puedes ver los ajustes, pero los cambios se guardan cuando haya conexión.</div>` : ""}
        <form id="cfgform" class="content" style="padding:0;gap:14px">
          ${CFG_FIELDS.map(([title, fields]) => `<div class="card"><h3>${title}</h3>${fields.map(([k, label, type, hint]) => {
            const v = k === "usuarios_permitidos" ? users : c[k] ?? "";
            return (type === "area"
              ? `<label class="field">${label}<textarea name="${k}" id="cfg-${k}" rows="4">${esc(v)}</textarea></label>`
              : `<label class="field">${label}<input name="${k}" id="cfg-${k}" value="${esc(v)}" ${type ? `inputmode="${type}"` : ""} autocomplete="off"></label>`) +
              (hint ? `<div class="muted small">${hint}</div>` : "");
          }).join("")}</div>`).join("")}
          <button class="pill block" type="submit" id="cfgsave">Guardar ajustes</button>
        </form>
        <div class="card"><h3>Datos</h3>
          <div class="muted small">${S.catalog.length} productos y ${S.clientes.length} clientes guardados en el teléfono.</div>
          <button class="pill soft block" data-act="reload">Actualizar catálogo y clientes</button>
          ${S.revisar.length ? `<details><summary class="small" style="min-height:40px;display:flex;align-items:center">${S.revisar.length} productos de Odoo ocultos por precio a revisar</summary>
            <div class="small muted" style="display:grid;gap:6px;padding-top:6px">${S.revisar.map((p) => `<div>${esc(p.n)} — <span class="num">${money(p.p)}</span></div>`).join("")}</div></details>` : ""}
          <div class="muted small">Los cambios hechos directamente en Odoo no regresan a la app: si alguien edita allá, Odoo manda. Para cambiar una cotización desde aquí usa <b>Editar</b>, que crea una revisión (R2, R3…).</div>
        </div>
        <div class="card"><h3>Ayuda</h3>
          <div class="muted small">¿Algo no funcionó como esperabas? Cuéntanos y lo revisamos.</div>
          <button class="pill soft block" data-act="nav" data-to="/reportar">Reportar un problema</button>
          <div class="muted small">Los reportes llegan al equipo de Kuu Kum.</div>
        </div>
        <div class="card"><h3>Registro del servidor</h3>
          <div class="muted small">Últimos errores de la API y de Odoo, con su código de referencia.</div>
          <button class="pill soft block" data-act="nav" data-to="/registro">Ver registro del servidor</button>
        </div>
        <div class="card"><h3>Versión</h3>
          <div class="kv"><span>Cotiza App</span><span class="num">${APP_VERSION}</span></div>
          <div class="muted small">Cotizaciones guardadas en este teléfono: ${quotes.all().length} · por subir: ${quotes.all().filter(needsSync).length}</div>
          ${S.updateTo ? `<div class="muted small">Disponible: ${esc(S.updateTo)}</div>` : ""}
          <button class="pill soft block" data-act="checkUpdate">Buscar actualización</button>
        </div>
        <div class="card"><h3>Verificar</h3>
          <div class="muted small">Comprueba que una cotización es auténtica.</div>
          <button class="pill soft block" data-act="nav" data-to="/verificar">Verificar el sello de una cotización</button>
        </div>
        <div class="card"><h3>Sesión</h3>
          <div class="muted small">Sesión: ${esc(S.user.email)}</div>
          <button class="pill danger block" data-act="logout">Cerrar sesión</button>
        </div>
      </main>
    </div>`;
  document.getElementById("cfgform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(document.getElementById("cfgsave"), async () => {
      S.cfg = await api("config", { method: "PUT", body }); ls.set("config", S.cfg); toast("Ajustes guardados");
    }, "Guardando…");
  });
}

// ---------- Registro del servidor ----------
function renderServerLog() {
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><button class="icon-btn" data-act="nav" data-to="/ajustes" aria-label="Volver">${I.back}</button><h1>Registro del servidor</h1></header>
      <main class="content">
        <div class="muted small">Errores con status 500 o más y fallos de Odoo de los últimos 30 días. El código <span class="num">req</span> es el mismo que aparece en "(ref …)" y en los reportes.</div>
        <button class="pill soft block" data-act="loadServerLog" id="slbtn">Actualizar</button>
        <div id="slist"></div>
      </main>
    </div>`;
  ACT.loadServerLog(document.getElementById("slbtn"));
}

// ---------- Verificar ----------
function renderVerify([folio = "", sello = ""] = []) {
  const prefill = !!(folio || sello);
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><button class="icon-btn" data-act="nav" data-to="${S.user ? "/ajustes" : "/login"}" aria-label="Volver">${I.back}</button><h1>Verificar sello</h1></header>
      <main class="content">
        <p class="muted" style="margin:0">Escanea el código QR que aparece al pie de la cotización.</p>
        <button class="pill block big" data-act="scan">${I.qr}<span>Escanear QR</span></button>
        <div id="vres"></div>
        <details class="card" id="vmanual" ${prefill ? "open" : ""}><summary>Ingresar manualmente</summary>
          <label class="field">Folio<input id="vf" class="num" value="${esc(folio)}" autocapitalize="characters" placeholder="KK-L0012"></label>
          <label class="field">Sello<input id="vs" class="num" value="${esc(formatSeal(sello))}" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
          <button class="pill block" data-act="verify" id="vbtn">Verificar</button>
        </details>
      </main>
    </div>`;
  if (folio && sello && S.user) withLoading(document.getElementById("vbtn"), doVerify, "Verificando…");
  else if (folio && sello) document.getElementById("vres").innerHTML = `<div class="notice info">Entra con una cuenta autorizada para ver el resultado.</div>`;
}
async function doVerify() {
  const { folio } = splitFolio(document.getElementById("vf").value);
  const sello = cleanSeal(document.getElementById("vs").value);
  const out = document.getElementById("vres");
  if (!folio || !sello) { out.innerHTML = `<div class="notice">Escribe el folio y el sello.</div>`; return; }
  const old = (rev, vigente, totalAnt, total) => {
    out.innerHTML = `<div class="verify warn"><b style="font-size:18px">⚠️ Revisión anterior (R${rev}). La vigente es R${vigente}</b>
      <div class="kv"><span>Total R${rev}</span><span class="num">${money(totalAnt)}</span></div>
      <div class="kv big"><span>Total vigente R${vigente}</span><span class="num">${money(total)}</span></div>
      <div class="small">El sello es auténtico, pero la cotización se actualizó después. Vale la revisión vigente.</div></div>`;
  };
  const show = (ok, title, snap) => {
    out.innerHTML = `<div class="verify ${ok ? "ok" : "bad"}"><b style="font-size:18px">${title}</b>${snap ? `
      <div>${esc(snap.cliente)} · ${new Date(snap.fecha).toLocaleDateString("es-MX")}</div>
      ${snap.items.map((i) => `<div class="kv small"><span>${i.q} × ${esc(i.n)}</span><span class="num">${money(i.q * i.p)}</span></div>`).join("")}
      <div class="kv big"><span>Total</span><span class="num">${money(snap.total)}</span></div>
      <div class="small">Compara estos datos contra el PDF que te mostraron. Si algo no coincide, el PDF fue alterado.</div>` : ""}</div>`;
  };
  const local = quotes.all().find((q) => q.folio === folio);
  if (local && local.sello === sello) {
    const t = calc(local);
    return show(true, "✅ Auténtica" + (revOf(local) > 1 ? ` · R${revOf(local)}` : ""), { cliente: local.cliente.nombre, fecha: local.fecha, items: local.items, total: t.total });
  }
  const h = local && (local.historial || []).find((x) => x.sello === sello);
  if (h) return old(h.rev, revOf(local), h.total, calc(local).total);
  if (!navigator.onLine) { out.innerHTML = `<div class="notice info">Sin internet. Solo puedo verificar cotizaciones hechas en este teléfono.</div>`; return; }
  try {
    const r = await api(`verificar?folio=${encodeURIComponent(folio)}&sello=${encodeURIComponent(sello)}`);
    if (r.estado === "autentica") show(true, "✅ Auténtica" + (r.rev > 1 ? ` · R${r.rev}` : "") + (r.odoo ? " · " + esc(r.odoo) : ""), r);
    else if (r.estado === "anterior") old(r.rev, r.vigente, r.totalAnterior, r.total);
    else if (r.estado === "invalido") show(false, "❌ El sello no corresponde a este folio. La cotización no es auténtica.");
    else show(false, "⏳ No encuentro ese folio. Puede ser falsa, o aún no se sincroniza desde el teléfono que la hizo.");
  } catch (e) { out.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
}

// ---------- Texto para WhatsApp ----------
function quoteText(q) {
  const t = calc(q);
  return `*Cotización Kuukum ${folioDe(q)}*\nPara: ${q.cliente.nombre}\n\n` +
    q.items.map((i) => `• ${i.q} × ${i.n} — ${money(i.p)} c/u = ${money(i.q * i.p)}`).join("\n") + "\n\n" +
    (Number(q.desc) ? `Descuento ${q.desc}%: −${money(t.desc)}\n` : "") + (q.iva ? `IVA 16%: ${money(t.iva)}\n` : "") +
    `*Total: ${money(t.total)}*${q.iva ? "" : " (sin IVA)"}\nAnticipo ${q.anticipoPct}%: ${money(t.anticipo)}\n` +
    `Entrega: ${q.entrega} · Vigencia: ${q.vigencia} días` + (q.notas ? `\n${q.notas}` : "") +
    `\n\nSello: ${formatSeal(q.sello)}`;
}

// ---------- Acciones ----------
const ACT = {
  nav: (el) => go(el.dataset.to),
  sync: (el) => {
    if (!navigator.onLine) return toast("Sin internet. Se sube solo cuando regrese la conexión.");
    return withLoading(el, async () => {
      const r = await runSync();
      if (r && r.skipped) toast("Ya se está sincronizando…");
      else if (r && !r.auth) toast(r.err ? `${r.ok} subidas, ${r.err} con error` : "Todo está en Odoo");
    }, el.dataset.label || "Subiendo…");
  },
  step: (el) => {
    const to = Number(el.dataset.to), d = S.draft;
    if (to > d.step && !stepValid(d.step)) return;
    if (to < 4) d.sello = null;
    d.step = to; saveDraft(); S.newClient = false; document.getElementById("toast").hidden = true; renderWizard(); window.scrollTo(0, 0);
  },
  discard: () => {
    if (!confirm("¿Descartar esta cotización?")) return;
    S.draft = null; ls.del("draft"); S.clientQuery = ""; go("/cotizaciones");
  },
  saveDraft: () => { saveDraft(); toast("Borrador guardado"); go("/cotizaciones"); },
  canal: (el) => { S.draft.canal = el.dataset.v; saveDraft(); document.querySelectorAll('[data-act="canal"]').forEach((b) => b.classList.toggle("on", b.dataset.v === S.draft.canal)); },
  pickClient: (el) => {
    const c = clientPool()[Number(el.dataset.i)];
    S.draft.cliente = { odooId: c.id || null, nombre: c.nombre, tel: c.tel || "", email: c.email || "", cautivo: !!c.cautivo };
    S.draft.porCorreo = false;
    saveDraft(); S.clientQuery = ""; renderWizard();
  },
  clearClient: () => { S.draft.cliente = { odooId: null, nombre: "", tel: "", email: "" }; saveDraft(); renderWizard(); },
  newClient: () => { S.newClient = true; S.draft.cliente = { odooId: null, nombre: S.clientQuery.replace(/[\d\s+()-]{6,}/, "").trim(), tel: (S.clientQuery.match(/[\d\s+()-]{6,}/) || [""])[0].trim(), email: "" }; renderWizard(); document.getElementById("nc-nombre")?.focus(); },
  cancelNew: () => { S.newClient = false; S.draft.cliente = { odooId: null, nombre: "", tel: "", email: "" }; saveDraft(); renderWizard(); },
  useNew: () => {
    const nombre = document.getElementById("nc-nombre").value.trim();
    if (!nombre) return toast("Escribe el nombre del cliente");
    S.draft.cliente = { odooId: null, nombre, tel: document.getElementById("nc-tel").value.trim(), email: document.getElementById("nc-email").value.trim() };
    S.newClient = false; saveDraft(); renderWizard();
  },
  openSheet: () => { if (!S.catalog.length) return toast("Catálogo vacío. Conéctate para descargarlo, o usa Producto libre.", 3500); openSheet(); },
  closeSheet: () => closeSheet(),
  facet: (el) => { const { k, v } = el.dataset; SH.sel[k] = SH.sel[k] === v ? undefined : v; SH.pick = null; drawSheet(); },
  pickProd: (el) => { SH.pick = Number(el.dataset.id); drawSheet(); },
  sheetQty: (el) => { SH.q = Math.max(1, (Number(document.getElementById("sheetq").value) || 1) + Number(el.dataset.d)); document.getElementById("sheetq").value = SH.q; },
  addPicked: () => {
    const p = S.catalog.find((x) => x.id === SH.pick); if (!p) return;
    SH.q = Math.max(1, Number(document.getElementById("sheetq").value) || 1);
    const ex = S.draft.items.find((i) => i.productId === p.id);
    if (ex) ex.q += SH.q; else S.draft.items.push({ productId: p.id, n: p.n, q: SH.q, p: p.p, c: p.c });
    saveDraft(); closeSheet(); renderWizard(); toast(`Agregado: ${SH.q} × ${p.n.split(".")[0]}`);
  },
  addFree: () => {
    S.draft.items.push({ productId: null, n: "Producto personalizado", q: 1, p: 0, c: 0 });
    saveDraft(); renderWizard();
    // Lo que falta es el precio: enfocarlo (teclado decimal) y seleccionarlo para escribir encima.
    const prices = document.querySelectorAll('.line [data-f="p"]'); const last = prices[prices.length - 1];
    if (last) { last.scrollIntoView({ block: "center" }); last.focus(); last.select(); }
  },
  qty: (el) => {
    const k = Number(el.closest(".line").dataset.k), it = S.draft.items[k];
    it.q = Math.max(1, Number(it.q) + Number(el.dataset.d));
    el.closest(".line").querySelector('[data-f="q"]').value = it.q;
    updateLine(k); saveDraft();
  },
  delLine: (el) => { S.draft.items.splice(Number(el.closest(".line").dataset.k), 1); saveDraft(); renderWizard(); },
  desc: (el) => { S.draft.desc = Number(el.dataset.v); saveDraft(); document.querySelectorAll('[data-act="desc"]').forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === S.draft.desc)); updateMini3(); },
  finish: (el) => {
    const d = S.draft;
    if (!d) return;                                     // doble toque: ya se guardó
    if (!d.sello) return toast("Espera a que se genere el sello");
    if (el.dataset.loading) return;
    const send = el.dataset.send === "1";
    const q = { ...d, estado: "guardada", enviada: false, sync: "pendiente", syncError: "", step: undefined, editOf: undefined, porCorreo: undefined };
    const orig = d.editOf && quotes.get(d.editOf);
    if (orig) {
      // Revisión N+1: mismo uuid y folio; se guarda el historial y la versión previa (para deshacer si Odoo la rechaza).
      q.historial = [...(orig.historial || []), { rev: revOf(orig), sello: orig.sello, total: calc(orig).total, fecha: orig.fecha }];
      q.odoo = orig.odoo ? { ...orig.odoo, enviada: false } : null;
      q.correo = orig.correo || null;
      q.revPrev = { ...orig, revPrev: undefined };
    }
    if (d.porCorreo && esCautivo(d.cliente)) q.correoPend = { force: false };
    quotes.put(q); S.draft = null; ls.del("draft"); S.clientQuery = "";
    // iOS: la hoja de compartir se abre aquí, dentro del toque; el spinner va después.
    const sharing = send ? sharePdf(q, S.cfg) : null;
    S.sending = true; renderBanner();
    document.querySelectorAll('[data-act="finish"]').forEach((b) => { if (b !== el) b.disabled = true; });
    return withLoading(el, async () => {
      try {
        if (sharing) {
          const res = await sharing;
          if (res !== "cancelled") { q.enviada = true; q.estado = "enviada"; quotes.put(q); }
          else toast("Guardada sin enviar. Puedes enviarla desde la lista.");
        } else toast(q.correoPend ? "Guardada. Se manda por correo al subir a Odoo." : orig ? `Revisión ${revOf(q)} guardada` : "Cotización guardada");
      } catch (e) { logError({ tipo: "compartir", mensaje: e.message }); toast("No se pudo compartir el PDF. La cotización sí quedó guardada.", 3500); }
      finally { S.sending = false; renderBanner(); }
      go("/cotizacion/" + q.uuid);
      runSync();
    }, send ? "Enviando…" : "Guardando…");
  },
  resend: async (el) => {
    const q = quotes.get(el.dataset.uuid);
    let res;
    try { res = await sharePdf(q, S.cfg); }
    catch (e) { logError({ tipo: "pdf", mensaje: e.message }); return toast("No se pudo generar el PDF: " + e.message, 3500); }
    if (res !== "cancelled" && !q.enviada) { q.enviada = true; q.estado = "enviada"; quotes.put(q); render(); runSync(); }
  },
  text: async (el) => {
    const txt = quoteText(quotes.get(el.dataset.uuid));
    if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(txt); toast("Texto copiado. Pégalo en WhatsApp."); } catch { toast("No se pudo copiar"); }
  },
  dup: (el) => {
    const q = quotes.get(el.dataset.uuid);
    if (S.draft && (S.draft.cliente.nombre || S.draft.items.length) && !confirm("Ya tienes un borrador en curso. ¿Reemplazarlo?")) return;
    S.draft = newDraft({ cliente: { ...q.cliente }, canal: q.canal, items: q.items.map((i) => ({ ...i })), desc: q.desc, iva: q.iva,
      anticipoPct: q.anticipoPct, entrega: q.entrega, vigencia: q.vigencia, notas: q.notas, step: 2 });
    saveDraft(); go("/nueva");
  },
  edit: (el) => {
    const q = quotes.get(el.dataset.uuid);
    if (!q || q.sync === "conflicto") return;
    if (S.draft && (S.draft.cliente.nombre || S.draft.items.length) && !confirm("Ya tienes un borrador en curso. ¿Reemplazarlo?")) return;
    S.draft = newDraft({ uuid: q.uuid, folio: q.folio, rev: revOf(q) + 1, editOf: q.uuid, creadoPor: q.creadoPor,
      cliente: { ...q.cliente }, canal: q.canal, items: q.items.map((i) => ({ ...i })), desc: q.desc, iva: q.iva,
      anticipoPct: q.anticipoPct, entrega: q.entrega, vigencia: q.vigencia, notas: q.notas, step: 2 });
    S.newClient = false; saveDraft(); go("/nueva");
  },
  undoRev: (el) => {
    const q = quotes.get(el.dataset.uuid);
    if (!q || !q.revPrev) return;
    if (!confirm(`¿Descartar la revisión ${revOf(q)} y volver a ${folioDe(q.revPrev)}?`)) return;
    quotes.put(q.revPrev); render();
  },
  mail: async (el) => {
    const q = quotes.get(el.dataset.uuid);
    if (!q || !esCautivo(q.cliente)) return toast("Correo disponible para clientes con al menos una compra.", 3500);
    const email = correoCliente(q.cliente);
    const ya = q.correo && q.correo.rev === revOf(q);
    const msg = ya
      ? `Ya se envió por correo el ${new Date(q.correo.fecha).toLocaleDateString("es-MX")} a ${q.correo.email}. ¿Enviarla otra vez?`
      : `¿Enviar ${folioDe(q)} por correo a ${email}?`;
    if (!confirm(msg)) return;
    q.correoPend = { force: !!ya }; q.correoError = ""; quotes.put(q);
    if (!navigator.onLine) { render(); return toast("Sin internet. El correo se manda al volver la conexión.", 3500); }
    await withLoading(el, async () => {
      await runSync();
      const cur = quotes.get(q.uuid);
      toast(cur.correoError ? cur.correoError : cur.correoPend ? "El correo quedó en cola." : "Correo enviado a " + email, 3500);
    }, "Enviando…");
    if (route() === "/cotizacion/" + q.uuid) render();
  },
  reportDone: () => { RP.hecho = null; go("/ajustes"); },
  addFoto: () => document.getElementById("rp-fotos")?.click(),
  rmFoto: (el) => { RP.fotos.splice(Number(el.dataset.i), 1); drawThumbs(); },
  sendReport: (el) => withLoading(el, sendReport, "Enviando…"),
  scan: () => openScanner({
    onCode: ({ folio, sello }) => {
      const m = document.getElementById("vmanual"); if (m) m.open = true;
      document.getElementById("vf").value = folio;
      document.getElementById("vs").value = formatSeal(sello);
      if (!S.user) { document.getElementById("vres").innerHTML = `<div class="notice info">Entra con una cuenta autorizada para ver el resultado.</div>`; return; }
      withLoading(document.getElementById("vbtn"), doVerify, "Verificando…");
    },
    onManual: () => { const m = document.getElementById("vmanual"); if (m) m.open = true; }
  }),
  loadServerLog: (el) => {
    const out = document.getElementById("slist");
    if (!navigator.onLine) { out.innerHTML = `<div class="notice info">Sin internet. El registro vive en el servidor.</div>`; return; }
    return withLoading(el, async () => {
      const { errores } = await api("errores");
      if (!document.getElementById("slist")) return;
      out.innerHTML = errores.length ? errores.map((e) => `
        <div class="logrow">
          <div class="kv small"><span>${new Date(e.ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" })}</span><span class="st ${e.status >= 500 ? "err" : "pend"}">${e.status}</span></div>
          <div class="num small">${esc(e.method)} ${esc(e.ruta)}${e.folio ? " · " + esc(e.folio) : ""}${e.ticket ? " · " + esc(e.ticket) : ""}</div>
          <div>${esc(e.mensaje)}</div>
          <div class="muted small num">${esc(e.usuario || "sin sesión")} · req ${esc(e.requestId)}</div>
        </div>`).join("") : `<div class="empty">Sin errores registrados. 🎉</div>`;
    }, "Cargando…");
  },
  applyUpdate: (el) => withLoading(el, applyUpdate, "Actualizando…"),
  checkUpdate: (el) => withLoading(el, async () => {
    if (!navigator.onLine) return toast("Sin internet");
    const v = await checkUpdate();
    if (!v) toast("No se pudo revisar. Intenta otra vez.");
    else if (v === APP_VERSION) toast(`Ya tienes la última versión (${APP_VERSION})`);
    else renderSettings();
  }, "Buscando…"),
  lf: (el) => { S.listFilter = el.dataset.v; renderList(); },
  reload: (el) => {
    if (!navigator.onLine) return toast("Sin internet");
    return withLoading(el, async () => { await refresh(true); toast("Catálogo y clientes al día"); if (route().startsWith("/ajustes")) renderSettings(); }, "Actualizando…");
  },
  verify: (el) => withLoading(el, doVerify, "Verificando…"),
  logout: async (el) => {
    const pend = quotes.all().filter(needsSync).length;
    if (!confirm(pend ? `Hay ${pend} cotización(es) sin subir a Odoo. Se quedan guardadas en este teléfono y se suben cuando vuelvas a entrar.\n\n¿Cerrar sesión?` : "¿Cerrar sesión en este teléfono?")) return;
    await withLoading(el, async () => { try { await api("auth/logout", { method: "POST" }); } catch {} }, "Cerrando…");
    await clearKeys(); ls.del("user"); S.user = null; go("/login");
  }
};

// ---------- Reportar un problema ----------
const RP = { pantalla: "", titulo: "", descripcion: "", fotos: [], hecho: null };
const MAX_FOTOS = 5;
const diagCtx = () => ({ version: APP_VERSION, user: S.user, ruta: S.prevRoute || route(), draft: S.draft });
function renderReport() {
  if (RP.hecho) {
    $app.innerHTML = `
      <div class="screen">
        <header class="topbar"><h1>Reportar un problema</h1></header>
        <main class="content">
          <div class="verify ok"><b style="font-size:18px">${RP.hecho.id ? `Reporte ${esc(RP.hecho.id)} enviado. Gracias.` : "Guardado. Se enviará cuando haya internet."}</b>
            <div class="small">${RP.hecho.id ? "Lo revisamos y te contestamos por correo." : "No tienes que hacer nada más: sale solo al volver la conexión."}</div></div>
          <button class="pill block" data-act="reportDone">Volver a Ajustes</button>
        </main>
      </div>`;
    return;
  }
  $app.innerHTML = `
    <div class="screen">
      <header class="topbar"><button class="icon-btn" data-act="nav" data-to="/ajustes" aria-label="Volver">${I.back}</button><h1>Reportar un problema</h1></header>
      <main class="content">
        <label class="field">Pantalla<select id="rp-pantalla">
          <option value="">Elige dónde pasó…</option>${PANTALLAS.map((p) => `<option ${RP.pantalla === p ? "selected" : ""}>${p}</option>`).join("")}
        </select></label>
        <label class="field">Nombre del error<input id="rp-titulo" maxlength="120" value="${esc(RP.titulo)}" autocomplete="off" placeholder="Ej. No aparece el botón Enviar"></label>
        <label class="field">Descripción<textarea id="rp-desc" rows="7" placeholder="¿Qué hacías, qué esperabas y qué pasó?">${esc(RP.descripcion)}</textarea></label>
        <div class="card"><h3>Fotos (opcional, hasta ${MAX_FOTOS})</h3>
          <div class="thumbs" id="rp-thumbs"></div>
          <input type="file" accept="image/*" multiple id="rp-fotos" hidden>
          <button class="pill soft block" data-act="addFoto" id="rp-add">Agregar fotos</button>
        </div>
        <details class="card"><summary class="small">Diagnóstico que se envía con el reporte</summary>
          <pre class="diag" id="rp-diag">Recolectando…</pre></details>
        <button class="pill block" data-act="sendReport" id="rp-send">Enviar reporte</button>
      </main>
    </div>`;
  drawThumbs();
  collectDiagnostics(diagCtx()).then((d) => { const el = document.getElementById("rp-diag"); if (el) el.textContent = diagText(d); });
}
function drawThumbs() {
  const box = document.getElementById("rp-thumbs"); if (!box) return;
  box.innerHTML = RP.fotos.map((f, i) => `<div class="thumb"><img src="${f.url}" alt="Foto ${i + 1}">
    <button data-act="rmFoto" data-i="${i}" aria-label="Quitar foto ${i + 1}">${I.x}</button></div>`).join("");
  const add = document.getElementById("rp-add");
  if (add) add.hidden = RP.fotos.length >= MAX_FOTOS;
}
// Reduce la foto en el teléfono: máx. 1600 px por lado, JPEG 0.8.
async function compressImage(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = src; await img.decode();
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(src); }
}
async function addFotos(files) {
  const libres = MAX_FOTOS - RP.fotos.length;
  if (files.length > libres) toast(`Solo caben ${MAX_FOTOS} fotos; se agregan las primeras ${libres}.`);
  for (const f of [...files].slice(0, libres)) {
    try { RP.fotos.push({ name: f.name.replace(/\.\w+$/, "") + ".jpg", url: await compressImage(f) }); }
    catch { toast("No se pudo leer una de las fotos"); }
    drawThumbs();
  }
}
async function sendReport() {
  const titulo = RP.titulo.trim(), descripcion = RP.descripcion.trim();
  if (!RP.pantalla || !titulo || !descripcion) return toast("Completa la pantalla, el nombre del error y la descripción.", 3000);
  // El diagnóstico se recolecta al enviar, con los valores de ese momento.
  const body = {
    clientId: crypto.randomUUID(), pantalla: RP.pantalla, titulo: titulo.slice(0, 120), descripcion, diag: await collectDiagnostics(diagCtx()),
    fotos: RP.fotos.map((f) => ({ name: f.name, mimetype: "image/jpeg", data: f.url.split(",")[1] }))
  };
  const done = (id) => { Object.assign(RP, { pantalla: "", titulo: "", descripcion: "", fotos: [], hecho: { id } }); renderReport(); };
  if (navigator.onLine) {
    try { const r = await api("reportes", { method: "POST", body }); return done(r.id); }
    catch (e) {
      // Errores de datos (400) se muestran; sin red, sin sesión o error de Odoo: a la cola.
      if (!(e instanceof AuthError) && e.status && e.status < 500) throw e;
    }
  }
  try { await outbox.put(body); }
  catch { throw new Error("No se pudo guardar el reporte en el teléfono."); }
  done(null);
}

function updateLine(k) {
  const it = S.draft.items[k];
  const card = document.querySelector(`.line[data-k="${k}"] .lf`);
  if (card) card.innerHTML = `Ganas ${money(it.q * (it.p - it.c))} · <b class="num">${money(it.q * it.p)}</b>`;
  const line = document.querySelector(`.line[data-k="${k}"]`); if (line) line.classList.toggle("warn", !(Number(it.p) > 0));
  const mini = document.getElementById("mini"); if (mini) mini.innerHTML = miniTotals();
  refreshNext();
}
function updateMini3() { const m = document.getElementById("mini3"); if (m) m.innerHTML = totalsBlock(S.draft); }

// Delegación de eventos
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "cq") { S.clientQuery = t.value; document.getElementById("clist").innerHTML = clientResults(); return; }
  if (t.id === "sq") { SH.text = t.value; SH.pick = null; drawSheet(true); return; }
  if (t.id === "lq") { S.listQuery = t.value; const pos = t.selectionStart; renderList(); const n = document.getElementById("lq"); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (t.id === "sheetq") { SH.q = Math.max(1, Number(t.value) || 1); return; }
  if (t.id === "rp-titulo") { RP.titulo = t.value; return; }
  if (t.id === "rp-desc") { RP.descripcion = t.value; return; }
  if (!S.draft) return;
  const line = t.closest(".line");
  if (line && t.dataset.f) {
    const k = Number(line.dataset.k), it = S.draft.items[k];
    it[t.dataset.f] = t.dataset.f === "n" ? t.value : parseMoney(t.value);
    saveDraft(); updateLine(k); return;
  }
  if (["anticipoPct", "vigencia", "entrega", "notas"].includes(t.id)) {
    S.draft[t.id] = ["anticipoPct", "vigencia"].includes(t.id) ? Number(t.value) || 0 : t.value;
    saveDraft(); updateMini3(); refreshNext();
  }
});
document.addEventListener("change", (e) => {
  // Al salir de un precio/costo/cantidad, mostrar el valor ya interpretado (p. ej. "1,500" -> 1500).
  const f = e.target.dataset && e.target.dataset.f;
  if (S.draft && ["p", "c", "q"].includes(f) && e.target.closest(".line")) {
    const it = S.draft.items[Number(e.target.closest(".line").dataset.k)];
    if (it) e.target.value = String(it[f]);
  }
  if (e.target.id === "iva" && S.draft) { S.draft.iva = e.target.checked; saveDraft(); updateMini3(); }
  if (e.target.id === "porCorreo" && S.draft) { S.draft.porCorreo = e.target.checked; saveDraft(); }
  if (e.target.id === "rp-pantalla") RP.pantalla = e.target.value;
  if (e.target.id === "rp-fotos") { const files = [...e.target.files]; e.target.value = ""; addFotos(files); }
});

boot();
