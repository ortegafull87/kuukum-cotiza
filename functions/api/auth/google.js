import { verifyGoogleIdToken } from "../../../lib/google.js";
import { makeSession, sessionCookie, getConfig, allowedEmails, getCookie, SESSION_DAYS } from "../../../lib/core.js";

// Google Identity Services en modo "redirect" hace POST aquí con el ID token.
export async function onRequestPost({ request, env }) {
  const back = (hash) => new Response(null, { status: 303, headers: { location: "/#" + hash } });
  try {
    const form = await request.formData();
    const credential = form.get("credential");
    const csrfBody = form.get("g_csrf_token");
    const csrfCookie = getCookie(request, "g_csrf_token");
    if (!csrfBody || csrfBody !== csrfCookie) return back("/login?e=csrf");
    const user = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
    const cfg = await getConfig(env);
    if (!allowedEmails(env, cfg).has(user.email)) return back("/login?e=" + encodeURIComponent(user.email));
    const token = await makeSession(env, user.email, user.name);
    return new Response(null, {
      status: 303,
      headers: { location: "/#/nueva", "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) }
    });
  } catch (e) {
    return back("/login?e=token");
  }
}
