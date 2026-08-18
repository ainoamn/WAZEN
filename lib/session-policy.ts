/** Browser session cookies (no Expires) plus a 10-minute idle cut-off. */

export const SESSION_IDLE_MS = 10 * 60 * 1000;
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-wazen_session" : "wazen_session";
}

export function sessionCookieFromStore(store: { get(name: string): { value: string } | undefined }) {
  return store.get(sessionCookieName())?.value
    || store.get("wazen_session")?.value
    || store.get("__Host-wazen_session")?.value
    || "";
}

export function csrfCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-wazen_csrf" : "wazen_csrf";
}

function secureAttribute() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

/** Session cookie with no Expires/Max-Age so it dies when the browser closes. */
export function browserSessionCookie(token: string) {
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureAttribute()}`;
}

export function browserCsrfCookie(token: string) {
  return `${csrfCookieName()}=${encodeURIComponent(token)}; Path=/; SameSite=Strict${secureAttribute()}`;
}

export function isSessionIdle(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) return true;
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return true;
  return nowMs - seen > SESSION_IDLE_MS;
}

export function idleCutoffIso(nowMs = Date.now()) {
  return new Date(nowMs - SESSION_IDLE_MS).toISOString();
}
