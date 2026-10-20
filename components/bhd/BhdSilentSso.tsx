"use client";

import { useEffect } from "react";
import { identityFetch, isIdentityOrigin, productStartPath } from "../../lib/identity/client";

type IdentityMe = { user?: { id?: string; email?: string } | null };
type ProductMe = { user?: { id?: string; email?: string; bhdSub?: string | null } | null };

function sameActiveAccount(identity: IdentityMe["user"], product: ProductMe["user"]) {
  if (!identity?.id || !product) return false;
  const identityEmail = (identity.email || "").trim().toLowerCase();
  const productEmail = (product.email || "").trim().toLowerCase();
  if (product.bhdSub && product.bhdSub === identity.id) return true;
  if (identityEmail && productEmail && identityEmail === productEmail) return true;
  return false;
}

/**
 * Direct links (not the app grid): bind product session to the active identity
 * account silently. Never /login?add=1, never force logout of other roster accounts.
 */
export function BhdSilentSso() {
  useEffect(() => {
    const path = window.location.pathname;
    if (
      isIdentityOrigin()
      || path.startsWith("/login")
      || path.startsWith("/register")
      || path.startsWith("/oauth")
      || path.startsWith("/api/")
      || path.startsWith("/auth/")
      || path.startsWith("/callback")
    ) {
      return;
    }

    let cancelled = false;
    const here = `${window.location.pathname}${window.location.search || ""}` || "/";
    const guardKey = `bhd-sso:${here}`;
    if (sessionStorage.getItem(guardKey) === "1") return;

    identityFetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then(async (identity: IdentityMe) => {
        if (cancelled || !identity.user?.id) return;
        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as ProductMe;
        if (cancelled) return;
        if (localResponse.ok && sameActiveAccount(identity.user, local.user)) return;
        sessionStorage.setItem(guardKey, "1");
        window.location.replace(productStartPath(here));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
