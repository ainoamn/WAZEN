"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  productStartPath,
} from "../../lib/identity/client";
import { loadBhdIdentity } from "../../lib/identity/bhd-browser";
import { useEffect } from "react";

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
 * Direct links: bind product session to the active identity account silently.
 * Rebind via window Bearer when product session exists; start only when unauthenticated locally.
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

    if (isAccountRebindPending()) return;

    let cancelled = false;

    void loadBhdIdentity().then(async (identity) => {
      if (cancelled || !identity) return;
      try {
        const { ok, body } = await identity.me();
        if (cancelled || !ok || !body.user?.id) {
          clearAccountRebindLock();
          return;
        }

        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as ProductMe;
        if (cancelled) return;

        if (localResponse.ok && sameActiveAccount(body.user, local.user)) {
          clearAccountRebindLock();
          return;
        }

        const guardKey = `bhd-sso:${body.user.id}`;
        const last = Number(sessionStorage.getItem(guardKey) || "0");
        if (last && Date.now() - last < 15_000) return;
        sessionStorage.setItem(guardKey, String(Date.now()));

        if (!local.user?.id && !local.user?.bhdSub) {
          const here = `${window.location.pathname}${window.location.search || ""}` || "/";
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }

        await applyAccountIsolation(body.token, { force: true });
      } catch {
        clearAccountRebindLock();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
