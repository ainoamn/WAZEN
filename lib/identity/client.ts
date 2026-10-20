import { BHD_APPS } from "../bhd/apps";
import { DEFAULT_BHD_IDENTITY_ISSUER } from "../bhd-identity";

export function pageOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin.replace(/\/$/, "");
}

export function isIdentityOrigin(origin = pageOrigin()) {
  const here = origin.replace(/\/$/, "");
  return here === DEFAULT_BHD_IDENTITY_ISSUER || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here);
}

export function identityApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isIdentityOrigin()) return normalized;
  return `${DEFAULT_BHD_IDENTITY_ISSUER}${normalized}`;
}

export function identityFetch(path: string, init?: RequestInit) {
  return fetch(identityApiUrl(path), {
    cache: "no-store",
    credentials: "include",
    ...init,
  });
}

export function currentReturnPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search || ""}` || "/";
}

export function productStartPath(returnTo = "/") {
  const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}`;
}

export function allowedBhdUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.origin)) return "";
    if (url.origin === DEFAULT_BHD_IDENTITY_ISSUER) return url.toString();
    if (BHD_APPS.some((app) => app.origin.replace(/\/$/, "") === url.origin)) return url.toString();
    if (url.hostname === "bhd-om.com" || url.hostname.endsWith(".bhd-om.com")) return url.toString();
  } catch {
    /* ignore */
  }
  return "";
}

/** Only path that may open /login?add=1 — never used for account switch. */
export function addAccountUrl() {
  const next = isIdentityOrigin()
    ? currentReturnPath()
    : `/auth/continue?to=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.href)}`;
  return `${identityApiUrl("/login")}?add=1&next=${encodeURIComponent(next)}`;
}

/**
 * After identity switch: wipe product session binding and re-enter via silent SSO
 * on the current path so every page shows the active account only.
 */
export function applyAccountIsolation() {
  if (typeof window === "undefined") return;
  const here = currentReturnPath();
  if (isIdentityOrigin()) {
    window.location.assign(here);
    return;
  }
  window.location.assign(productStartPath(here));
}
