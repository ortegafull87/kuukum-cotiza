// Server for Kuukum Cotiza (AI Studio Node.js environment)
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as middleware from "./functions/api/_middleware.js";
import * as authGoogle from "./functions/api/auth/google.js";
import * as authLogout from "./functions/api/auth/logout.js";
import * as catalogo from "./functions/api/catalogo.js";
import * as clientes from "./functions/api/clientes.js";
import * as configApi from "./functions/api/config.js";
import * as correo from "./functions/api/correo.js";
import * as errores from "./functions/api/errores.js";
import * as estado from "./functions/api/estado.js";
import * as meApi from "./functions/api/me.js";
import * as reportes from "./functions/api/reportes.js";
import * as syncApi from "./functions/api/sync.js";
import * as verificar from "./functions/api/verificar.js";

import { makeSession, sessionCookie, SESSION_DAYS, getConfig, allowedEmails, json, fail } from "./lib/core.js";
import { createMockOdoo } from "./lib/mock-odoo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

// ---------- Cloudflare KV In-Memory & File-Backed Implementation ----------
class StorageKV {
  constructor(filePath) {
    this.filePath = filePath;
    this.store = new Map();
    this.metadata = new Map();
    this.ttls = new Map();
    this.load();
  }

  load() {
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        for (const [k, v] of Object.entries(raw.store || {})) this.store.set(k, v);
        for (const [k, v] of Object.entries(raw.metadata || {})) this.metadata.set(k, v);
      } catch (e) {
        console.warn("Could not load KV store from file:", e.message);
      }
    }
  }

  save() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        store: Object.fromEntries(this.store.entries()),
        metadata: Object.fromEntries(this.metadata.entries())
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not save KV store to file:", e.message);
    }
  }

  async get(key, type) {
    const ttl = this.ttls.get(key);
    if (ttl && ttl < Date.now()) {
      this.store.delete(key);
      this.metadata.delete(key);
      this.ttls.delete(key);
      return null;
    }
    const val = this.store.get(key);
    if (val === undefined || val === null) return null;
    if (type === "json") {
      try { return JSON.parse(val); } catch { return null; }
    }
    return String(val);
  }

  async put(key, val, options = {}) {
    const strVal = typeof val === "string" ? val : JSON.stringify(val);
    this.store.set(key, strVal);
    if (options.metadata) {
      this.metadata.set(key, options.metadata);
    }
    if (options.expirationTtl) {
      this.ttls.set(key, Date.now() + options.expirationTtl * 1000);
    }
    this.save();
  }

  async delete(key) {
    this.store.delete(key);
    this.metadata.delete(key);
    this.ttls.delete(key);
    this.save();
  }

  async list(options = {}) {
    const prefix = options.prefix || "";
    const limit = options.limit || 1000;
    const now = Date.now();
    const keys = [];
    for (const [name] of this.store.entries()) {
      const ttl = this.ttls.get(name);
      if (ttl && ttl < now) continue;
      if (name.startsWith(prefix)) {
        keys.push({
          name,
          metadata: this.metadata.get(name) || undefined
        });
        if (keys.length >= limit) break;
      }
    }
    return { keys };
  }
}

const kv = new StorageKV(path.join(__dirname, ".data", "kv.json"));

// ---------- Environment Setup ----------
const isRealOdoo = !!process.env.ODOO_API_KEY;
const mockOdoo = isRealOdoo ? null : createMockOdoo();

let odooUrl = (process.env.ODOO_URL || "https://kuukum.odoo.com").trim();
if (odooUrl.includes("kuukum.odoo.mx")) {
  odooUrl = odooUrl.replace("kuukum.odoo.mx", "kuukum.odoo.com");
}

const env = {
  KK: kv,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "273765990336-id4d6tq1b77lqq35si9rk66eb94k16h3.apps.googleusercontent.com",
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS || "loidaegr@gmail.com,ortegafull87@gmail.com,kuukum.mx@gmail.com",
  ODOO_URL: isRealOdoo ? odooUrl : `http://127.0.0.1:${PORT}`,
  ODOO_API_KEY: isRealOdoo ? process.env.ODOO_API_KEY : "mock-local-key",
  ODOO_DB: process.env.ODOO_DB || "",
  REPORTES_EMAIL: process.env.REPORTES_EMAIL || "hola@kuukum.mx",
  SESSION_SECRET: process.env.SESSION_SECRET || "dev-session-secret-kuukum-2026",
  SEAL_SECRET: process.env.SEAL_SECRET || "dev-seal-secret-kuukum-2026",
  CF_PAGES_COMMIT_SHA: process.env.CF_PAGES_COMMIT_SHA || "dev-local",
  CF_PAGES_BRANCH: process.env.CF_PAGES_BRANCH || "main"
};

const app = express();
app.set("trust proxy", true);

// Parse raw body for API requests so we can pass intact bytes to Web Request
app.use(express.raw({ type: "*/*", limit: "25mb" }));

// Security headers (permissive enough for AI Studio preview iframe)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ---------- Mock Odoo API Routes (when not using live Odoo) ----------
if (mockOdoo) {
  app.post(/^\/json\/2\/([\w.]+)\/(\w+)$/, (req, res) => {
    const model = req.params[0];
    const method = req.params[1];
    let body = {};
    if (req.body && req.body.length > 0) {
      try { body = JSON.parse(req.body.toString("utf-8")); } catch {}
    }
    try {
      const result = mockOdoo.handle(model, method, body);
      res.status(200).json(result);
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  });
}

// ---------- Dev Login Endpoint ----------
// Convenient single-click login for allowed users in preview/dev mode
app.all("/api/auth/dev-login", async (req, res) => {
  let email = "kuukum.mx@gmail.com";
  let name = "Kuukum Personalizados";

  if (req.query.email) email = String(req.query.email).trim().toLowerCase();
  else if (req.body && req.body.length > 0) {
    try {
      const str = req.body.toString("utf-8");
      const parsed = str.startsWith("{") ? JSON.parse(str) : Object.fromEntries(new URLSearchParams(str));
      if (parsed.email) email = String(parsed.email).trim().toLowerCase();
      if (parsed.name) name = String(parsed.name).trim();
    } catch {}
  }

  const cfg = await getConfig(env);
  const allowed = allowedEmails(env, cfg);
  if (!allowed.has(email)) {
    return res.status(403).send(`El correo ${email} no está en la lista de usuarios permitidos.`);
  }

  const token = await makeSession(env, email, name);
  let cookieHeader = sessionCookie(token, SESSION_DAYS * 86400);

  // If request is plain HTTP, adjust cookie attributes for local browser
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (!isHttps) {
    cookieHeader = cookieHeader
      .replace(/;\s*Secure/gi, "")
      .replace(/;\s*SameSite=None/gi, "; SameSite=Lax")
      .replace(/;\s*Partitioned/gi, "");
  }

  res.setHeader("Set-Cookie", cookieHeader);
  const wantsJson = (req.headers.accept || "").includes("application/json") ||
                    (req.headers["content-type"] || "").includes("application/json");
  if (wantsJson) {
    return res.json({ ok: true, token, email, name, location: "/#/nueva" });
  }

  res.redirect(303, `/#/nueva?token=${encodeURIComponent(token)}`);
});

// ---------- Dispatch API to Cloudflare Pages Functions ----------
const ROUTES = [
  { path: "/api/auth/google", method: "POST", handler: authGoogle.onRequestPost },
  { path: "/api/auth/logout", method: "POST", handler: authLogout.onRequestPost },
  { path: "/api/catalogo", method: "GET", handler: catalogo.onRequestGet },
  { path: "/api/clientes", method: "GET", handler: clientes.onRequestGet },
  { path: "/api/config", method: "GET", handler: configApi.onRequestGet },
  { path: "/api/config", method: "PUT", handler: configApi.onRequestPut },
  { path: "/api/correo", method: "POST", handler: correo.onRequestPost },
  { path: "/api/errores", method: "GET", handler: errores.onRequestGet },
  { path: "/api/estado", method: "POST", handler: estado.onRequestPost },
  { path: "/api/me", method: "GET", handler: meApi.onRequestGet },
  { path: "/api/reportes", method: "POST", handler: reportes.onRequestPost },
  { path: "/api/sync", method: "POST", handler: syncApi.onRequestPost },
  { path: "/api/verificar", method: "GET", handler: verificar.onRequestGet }
];

app.use("/api", async (req, res) => {
  const urlPath = "/api" + (req.path === "/" ? "" : req.path);
  const method = req.method.toUpperCase();

  // Find matching route handler
  const match = ROUTES.find((r) => r.path === urlPath && r.method === method);

  // Convert Express req to Web standard Request
  const fullUrl = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const item of v) headers.append(k, item);
    else if (v !== undefined) headers.set(k, v);
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const webRequest = new Request(fullUrl.href, {
    method,
    headers,
    body: hasBody && req.body && req.body.length > 0 ? req.body : undefined,
    duplex: "half"
  });

  const context = {
    request: webRequest,
    env,
    data: {},
    waitUntil: (p) => { if (p && p.catch) p.catch(console.error); },
    next: async () => {
      if (!match) return fail(`Ruta no encontrada: ${method} ${urlPath}`, 404);
      return await match.handler(context);
    }
  };

  try {
    const webResponse = await middleware.onRequest(context);

    res.status(webResponse.status);

    // Copy headers from Web Response to Express res
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    for (const [k, v] of webResponse.headers.entries()) {
      if (k.toLowerCase() === "set-cookie") {
        let cookieVal = v;
        if (!isHttps) cookieVal = cookieVal.replace(/;\s*Secure/gi, "");
        res.setHeader("Set-Cookie", cookieVal);
      } else {
        res.setHeader(k, v);
      }
    }

    const buf = Buffer.from(await webResponse.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error("Unhandled error in API handler:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
});

// ---------- Static Frontend ----------
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath, {
  etag: true,
  maxAge: 0,
  index: "index.html"
}));

// SPA Fallback: for any navigation route, return index.html
app.use((req, res) => {
  if (req.accepts("html")) {
    res.sendFile(path.join(publicPath, "index.html"));
  } else {
    res.status(404).end();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Kuukum Cotiza dev server running on http://${HOST}:${PORT}`);
  if (mockOdoo) {
    console.log("Mock Odoo 19 active for local development");
  } else {
    console.log(`Connected to live Odoo at ${env.ODOO_URL}`);
  }
});
