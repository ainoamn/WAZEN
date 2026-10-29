/** Product session per docs/BHD-SESSION-POLICY.md: persists until explicit logout, no idle timeout. */

import { identitySessionMaxAgeSecCached, SESSION_MAX_AGE_FALLBACK } from "./bhd/runtime.ts";

/** @deprecated Prefer identitySessionMaxAgeSecCached() — live value from id.bhd-om.com/api/bhd/runtime. */
export const SESSION_MAX_AGE_SEC = SESSION_MAX_AGE_FALLBACK;

export function sessionMaxAgeSec() {
  return identitySessionMaxAgeSecCached();
}

export function sessionMaxMs() {
  return sessionMaxAgeSec() * 1000;
}

/** @deprecated Use sessionMaxMs() for new sessions. */
export const SESSION_MAX_MS = SESSION_MAX_AGE_FALLBACK * 1000;

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
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAgeSec()}; HttpOnly; SameSite=Lax${secureAttribute()}`;
}

export function persistentCsrfCookie(token: string) {
  return `${csrfCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAgeSec()}; SameSite=Strict${secureAttribute()}`;
}
