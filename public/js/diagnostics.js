// Diagnóstico para "Reportar un problema". Solo lo que el navegador expone.
// Nunca: ubicación, contactos, cookies, tokens de sesión, la llave del sello ni datos de clientes (salvo el folio del borrador).
// iOS: Safari no deja conocer el modelo exacto del iPhone; versión de iOS + pantalla + densidad bastan para la familia.
import { ls, quotes, needsSync, hasSealKey, recentErrors } from "./store.js?v=0.4.2";

const safe = async (fn, d = "desconocido") => { try { const v = await fn(); return v === undefined ? d : v; } catch { return d; } };
const kb = (n) => Math.round(n / 1024) + " KB";
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

// Sistema y navegador a partir del userAgent.
export function parseUA(ua = navigator.userAgent) {
  let os = "desconocido", navegador = "desconocido";
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)*)/);
  const ipadDesktop = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const safariV = ua.match(/Version\/([\d.]+)/);
  if (ios || ipadDesktop) {
    const fam = /iPad/.test(ua) || ipadDesktop ? "iPadOS" : "iOS";
    const v = ios ? ios[1].replace(/_/g, ".") : "";
    // Desde Safari 26 el UA congela la versión del sistema (18.6); la versión de Safari sigue a la de iOS.
    os = safariV && Number(safariV[1].split(".")[0]) >= 26 ? `${fam} ${safariV[1]}` : `${fam} ${v}${v === "18.6" ? " (o posterior: el UA la congela)" : ""}`.trim();
  } else if (/Android ([\d.]+)/.test(ua)) os = "Android " + ua.match(/Android ([\d.]+)/)[1];
  else if (/Windows NT ([\d.]+)/.test(ua)) os = "Windows " + ua.match(/Windows NT ([\d.]+)/)[1];
  else if (/Mac OS X ([\d_]+)/.test(ua)) os = "macOS " + ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, ".");
  const m = ua.match(/(EdgiOS|Edg|CriOS|FxiOS|Firefox|SamsungBrowser|OPR|Chrome)\/([\d.]+)/);
  if (m) navegador = ({ EdgiOS: "Edge", Edg: "Edge", CriOS: "Chrome", FxiOS: "Firefox", OPR: "Opera", SamsungBrowser: "Samsung Internet" }[m[1]] || m[1]) + " " + m[2];
  else if (safariV) navegador = "Safari " + safariV[1];
  else if (/AppleWebKit/.test(ua) && (ios || ipadDesktop)) navegador = "WebKit (app instalada)";
  return { os, navegador };
}

const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "nunca");

// ctx: { version, user, ruta, draft } desde app.js.
export async function collectDiagnostics(ctx) {
  const all = quotes.all();
  const reg = await safe(() => navigator.serviceWorker && navigator.serviceWorker.getRegistration(), null);
  const versionJson = await safe(async () => (await (await fetch("/version.json", { cache: "no-store" })).json()).version, "sin conexión");
  const { os, navegador } = parseUA();
  const hints = await safe(async () => navigator.userAgentData && navigator.userAgentData.getHighEntropyValues
    ? await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]) : null, null);
  const est = await safe(() => navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null, null);
  let lsBytes = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("kk_")) lsBytes += (k.length + (localStorage.getItem(k) || "").length) * 2; } } catch {}
  const bat = await safe(async () => { if (!navigator.getBattery) return "no disponible"; const b = await navigator.getBattery(); return `${Math.round(b.level * 100)}%${b.charging ? " cargando" : ""}`; });
  const cam = await safe(async () => navigator.permissions ? (await navigator.permissions.query({ name: "camera" })).state : "no disponible");
  const conn = navigator.connection;
  const catalogo = ls.get("catalog", null), clientes = ls.get("clientes", null);
  const sw = !("serviceWorker" in navigator) ? "no soportado"
    : [navigator.serviceWorker.controller ? "activo" : "sin control", reg && reg.waiting ? "nueva versión en espera" : ""].filter(Boolean).join(" · ");
  const cache = await safe(async () => (await caches.keys()).filter((k) => k.startsWith("kuukum")).join(", ") || "ninguno");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { user, draft } = ctx;

  return {
    app: {
      version: ctx.version,
      versionPublicada: versionJson,
      versionDifiere: typeof versionJson === "string" && /^\d/.test(versionJson) ? versionJson !== ctx.version : "no se pudo comparar",
      cache, serviceWorker: sw,
      instalada: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      ruta: ctx.ruta || "",
      borrador: draft ? { folio: draft.folio || "sin folio", rev: draft.rev || 1, paso: draft.step || 1 } : "ninguno",
      usuario: user ? user.email : "", prefijo: user ? user.prefijo : "",
      fechaLocal: new Date().toLocaleString("es-MX", { timeZone: tz }) + " " + tz
    },
    datos: {
      cotizaciones: all.length,
      porSubir: all.filter(needsSync).length,
      conError: all.filter((q) => q.sync === "error" || q.sync === "conflicto").length,
      erroresSync: ls.get("syncErrors", []).slice(-5),
      ultimoSync: fmtFecha(ls.get("lastSync", null)),
      productos: catalogo ? (catalogo.productos || []).length : 0, catalogoDescargado: fmtFecha(catalogo && catalogo.at),
      clientes: clientes ? (clientes.clientes || []).length : 0, clientesDescargados: fmtFecha(clientes && clientes.at),
      almacenamiento: est ? `${mb(est.usage || 0)} de ${mb(est.quota || 0)}` : "no disponible",
      localStorage: kb(lsBytes),
      llaveSello: user ? ((await safe(() => hasSealKey(user.email), false)) ? "sí" : "no") : "sin usuario"
    },
    dispositivo: {
      userAgent: navigator.userAgent, os, navegador,
      ...(hints ? { modelo: hints.model || "", versionPlataforma: hints.platformVersion || "" } : {}),
      pantalla: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`, densidad: devicePixelRatio,
      orientacion: (screen.orientation && screen.orientation.type) || (matchMedia("(orientation: portrait)").matches ? "vertical" : "horizontal"),
      idiomas: (navigator.languages || [navigator.language]).join(", "),
      tema: matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro",
      movimientoReducido: matchMedia("(prefers-reduced-motion: reduce)").matches,
      conexion: navigator.onLine ? "en línea" : "sin conexión",
      red: conn ? [conn.type, conn.effectiveType, conn.downlink ? conn.downlink + " Mbps" : ""].filter(Boolean).join(" · ") || "desconocida" : "no disponible",
      nucleos: navigator.hardwareConcurrency || "no disponible",
      memoriaGB: navigator.deviceMemory || "no disponible",
      bateria: bat, permisoCamara: cam
    },
    errores: recentErrors().slice(-30)
  };
}

// Resumen legible para la pantalla del reporte.
export function diagText(d) {
  const line = (k, v) => `${k}: ${v && typeof v === "object" ? JSON.stringify(v) : v}`;
  return [
    "APP", ...Object.entries(d.app).map(([k, v]) => line(k, v)),
    "", "DATOS", ...Object.entries(d.datos).map(([k, v]) => line(k, v)),
    "", "DISPOSITIVO", ...Object.entries(d.dispositivo).map(([k, v]) => line(k, v)),
    "", `ERRORES RECIENTES (${d.errores.length})`, ...d.errores.map((e) => `${e.fecha} · ${e.tipo || ""} ${e.ruta || ""} ${e.status ?? ""} ${e.mensaje || ""}${e.requestId ? " · req " + e.requestId : ""}`.replace(/\s+/g, " "))
  ].join("\n");
}
