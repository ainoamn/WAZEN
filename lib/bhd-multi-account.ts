"use client";

import {
  addAccountUrl,
  applyAccountIsolation,
  identityFetch,
  switchWindowAccount,
} from "./identity/client";

export { switchWindowAccount };

export type AuthProviderMark = "password" | "google" | "facebook" | "whatsapp";

export type IdentityAccount = {
  id?: string;
  name: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  picture: string | null;
  providers?: AuthProviderMark[];
  googleLinked?: boolean;
  facebookLinked?: boolean;
  hasPassword?: boolean;
};

export type IdentityMeResponse = {
  ok?: boolean;
  user?: IdentityAccount | null;
  accounts?: IdentityAccount[];
};

/** Workspace path after silent product SSO (frozen catalog). */
export function wazenWorkspacePath() {
  return "/dashboard";
}

/** Only «إضافة حساب آخر» may open login?add=1. */
export function identityLoginAddUrl() {
  return addAccountUrl();
}

export async function fetchIdentityAccounts(): Promise<IdentityMeResponse> {
  const response = await identityFetch("/api/auth/me", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { user: null, accounts: [] };
  return (await response.json()) as IdentityMeResponse;
}

export async function switchIdentityAccount(sub: string): Promise<IdentityMeResponse> {
  const switched = await switchWindowAccount(sub);
  if (!switched.ok) return { user: null, accounts: [] };
  const response = await identityFetch("/api/auth/me", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { user: null, accounts: [] };
  return (await response.json()) as IdentityMeResponse;
}

export async function logoutIdentityAccount(all: boolean): Promise<IdentityMeResponse> {
  const response = await identityFetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ all }),
  });
  const data = (await response.json().catch(() => ({}))) as IdentityMeResponse;
  if (!response.ok) return { user: null, accounts: [] };
  return data;
}

/** Re-bind product session to the active identity account (never /login?add=1). */
export function openProductSilentSso(returnTo?: string) {
  if (returnTo) {
    const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    window.location.assign(`/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}`);
    return;
  }
  applyAccountIsolation();
}

export function openProductWorkspace(returnTo = wazenWorkspacePath()) {
  openProductSilentSso(returnTo);
}

export function buildEndSessionUrl(all: boolean) {
  const url = new URL(`${(process.env.NEXT_PUBLIC_BHD_IDENTITY_ISSUER || "https://id.bhd-om.com").replace(/\/$/, "")}/oauth/end-session`);
  url.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/`);
  url.searchParams.set("client_id", process.env.NEXT_PUBLIC_BHD_OAUTH_CLIENT_ID || "bhd-wazen");
  if (all) url.searchParams.set("all", "1");
  return url.toString();
}

export { applyAccountIsolation, addAccountUrl, paintPrivacyVeil } from "./identity/client";
