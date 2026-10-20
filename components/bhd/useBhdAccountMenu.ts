"use client";

import { useCallback, useEffect, useState } from "react";
import type { BhdSwitcherUser } from "./BhdAppSwitcher";
import {
  buildEndSessionUrl,
  fetchIdentityAccounts,
  identityLoginAddUrl,
  logoutIdentityAccount,
  openProductSilentSso,
  switchIdentityAccount,
  wazenWorkspacePath,
  type IdentityAccount,
  type IdentityMeResponse,
} from "../../lib/bhd-multi-account";
import { clearAdminConsole } from "../../lib/admin-session";
import { notifyBrowserSessionChange } from "../../lib/browser-session-client";
import { apiFetch } from "../../lib/client-api";
import { clearDashboardCache } from "../../lib/dashboard-session";
import { resetAppPrefetch } from "../../lib/app-prefetch";

async function clearProductSessionOnly() {
  try {
    await apiFetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  } catch {
    /* still leave local caches */
  }
  clearAdminConsole();
  clearDashboardCache();
  resetAppPrefetch();
  notifyBrowserSessionChange(null);
}

function mergeAccount(base: BhdSwitcherUser, identity?: IdentityAccount | null): BhdSwitcherUser {
  if (!identity) return base;
  return {
    id: identity.id || base.id,
    name: identity.name || base.name,
    email: identity.email || base.email,
    username: identity.username ?? base.username ?? null,
    phone: identity.phone ?? base.phone ?? null,
    picture: identity.picture ?? base.picture,
    providers: identity.providers,
    googleLinked: identity.googleLinked,
    facebookLinked: identity.facebookLinked,
    hasPassword: identity.hasPassword,
  };
}

function applyMe(
  base: BhdSwitcherUser,
  data: IdentityMeResponse,
  setUser: (user: BhdSwitcherUser) => void,
  setAccounts: (accounts: BhdSwitcherUser[]) => void,
) {
  if (!data.user) return false;
  const nextUser = mergeAccount(base, data.user);
  setUser(nextUser);
  setAccounts(
    (data.accounts?.length ? data.accounts : [data.user]).map((item) => mergeAccount(base, item)),
  );
  return true;
}

export function useBhdAccountMenu(productUser: BhdSwitcherUser, locale: "ar" | "en" = "ar") {
  const [user, setUser] = useState<BhdSwitcherUser>(productUser);
  const [accounts, setAccounts] = useState<BhdSwitcherUser[]>([productUser]);

  useEffect(() => {
    setUser((current) => ({
      ...productUser,
      id: current.id || productUser.id,
      username: current.username ?? productUser.username,
      phone: current.phone ?? productUser.phone,
      providers: current.providers ?? productUser.providers,
      googleLinked: current.googleLinked ?? productUser.googleLinked,
      facebookLinked: current.facebookLinked ?? productUser.facebookLinked,
      hasPassword: current.hasPassword ?? productUser.hasPassword,
    }));
  }, [
    productUser.id,
    productUser.name,
    productUser.email,
    productUser.picture,
    productUser.username,
    productUser.phone,
  ]);

  useEffect(() => {
    let cancelled = false;
    void fetchIdentityAccounts()
      .then((data) => {
        if (cancelled) return;
        if (!applyMe(productUser, data, setUser, setAccounts)) {
          setAccounts([productUser]);
        }
      })
      .catch(() => {
        if (!cancelled) setAccounts([productUser]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    productUser.id,
    productUser.name,
    productUser.email,
    productUser.picture,
    productUser.username,
    productUser.phone,
  ]);

  const switchAccount = useCallback(async (sub: string) => {
    const previousId = user.id;
    const optimistic = accounts.find((item) => item.id === sub);
    if (optimistic) setUser(optimistic);

    const data = await switchIdentityAccount(sub);
    if (!data.user) return;
    applyMe(productUser, data, setUser, setAccounts);

    // Product session still belongs to the previous identity — silent SSO rebinds it.
    if (data.user.id && data.user.id !== previousId) {
      await clearProductSessionOnly();
      openProductSilentSso(wazenWorkspacePath(), data.user.email);
      await new Promise<never>(() => {});
    }
  }, [accounts, productUser, user.id]);

  const addAccount = useCallback(() => {
    window.location.assign(identityLoginAddUrl());
  }, []);

  const signOutThis = useCallback(async () => {
    const data = await logoutIdentityAccount(false);
    if (data.user) {
      applyMe(productUser, data, setUser, setAccounts);
      await clearProductSessionOnly();
      openProductSilentSso(wazenWorkspacePath(), data.user.email);
      await new Promise<never>(() => {});
      return;
    }
    await clearProductSessionOnly();
    window.location.replace(buildEndSessionUrl(false));
    await new Promise<never>(() => {});
  }, [productUser]);

  const signOutAll = useCallback(async () => {
    await clearProductSessionOnly();
    try {
      await logoutIdentityAccount(true);
    } catch {
      /* still end-session */
    }
    window.location.replace(buildEndSessionUrl(true));
    await new Promise<never>(() => {});
  }, []);

  return {
    user,
    accounts,
    locale,
    switchAccount,
    addAccount,
    signOutThis,
    signOutAll,
  };
}
