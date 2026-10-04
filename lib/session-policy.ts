/** Product session per docs/BHD-SESSION-POLICY.md: persists until explicit logout, no idle timeout. */

/** 400 days — Chromium's practical cookie ceiling, not an idle window. */
export const SESSION_MAX_AGE_SEC = 400 * 24 * 60 * 60;
export const SESSION_MAX_MS = SESSION_MAX_AGE_SEC * 1000;

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

/** Host-only (no Domain), written only on explicit sign-in. */
export function persistentSessionCookie(token: string) {
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secureAttribute()}`;
}

export function persistentCsrfCookie(token: string) {
  return `${csrfCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; SameSite=Strict${secureAttribute()}`;
}
