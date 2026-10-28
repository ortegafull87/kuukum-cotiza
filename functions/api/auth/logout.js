import { json, sessionCookie } from "../../../lib/core.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}
