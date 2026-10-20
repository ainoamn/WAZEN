"use client";

import { DEFAULT_BHD_IDENTITY_ISSUER } from "./bhd-identity";

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
  user?: IdentityAccount | null;
  accounts?: IdentityAccount[];
};

function identityOrigin() {
  return (process.env.NEXT_PUBLIC_BHD_IDENTITY_ISSUER || DEFAULT_BHD_IDENTITY_ISSUER).replace(/\/$/, "");
}

/** Workspace path after silent product SSO (frozen catalog). */
export function wazenWorkspacePath() {
  return "/dashboard";
}

export function identityLoginAddUrl() {
  return `${identityOrigin()}/login?add=1`;
}

export async function fetchIdentityAccounts(): Promise<IdentityMeResponse> {
  const response = await fetch(`${identityOrigin()}/api/auth/me`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { user: null, accounts: [] };
  return (await response.json()) as IdentityMeResponse;
}

export async function switchIdentityAccount(sub: string): Promise<boolean> {
  const response = await fetch(`${identityOrigin()}/api/auth/switch`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sub }),
  });
  return response.ok;
}

export async function logoutIdentityAccount(all: boolean): Promise<{ user: IdentityAccount | null }> {
  const response = await fetch(`${identityOrigin()}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ all }),
  });
  if (!response.ok) return { user: null };
  const data = (await response.json()) as { user?: IdentityAccount | null };
  return { user: data.user ?? null };
}

/** Silent product SSO after identity switch / this-account logout with remaining roster. */
export function silentProductStart(returnTo = wazenWorkspacePath()) {
  const path = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
  window.location.assign(`/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}`);
}

export function buildEndSessionUrl(all: boolean) {
  const url = new URL(`${identityOrigin()}/oauth/end-session`);
  url.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/`);
  url.searchParams.set("client_id", process.env.NEXT_PUBLIC_BHD_OAUTH_CLIENT_ID || "bhd-wazen");
  if (all) url.searchParams.set("all", "1");
  return url.toString();
}
