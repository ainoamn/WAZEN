"use client";

import { useCallback, useEffect, useState } from "react";
import type { BhdSwitcherUser } from "./BhdAppSwitcher";
import {
  buildEndSessionUrl,
  fetchIdentityAccounts,
  identityLoginAddUrl,
  logoutIdentityAccount,
  silentProductStart,
  switchIdentityAccount,
  wazenWorkspacePath,
  type IdentityAccount,
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
        const nextUser = mergeAccount(productUser, data.user);
        setUser(nextUser);
        const list = data.accounts?.length
          ? data.accounts.map((item) => mergeAccount(productUser, item))
          : data.user
            ? [nextUser]
            : [productUser];
        setAccounts(list);
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
    const ok = await switchIdentityAccount(sub);
    if (!ok) return;
    await clearProductSessionOnly();
    silentProductStart(wazenWorkspacePath());
    await new Promise<never>(() => {});
  }, []);

  const addAccount = useCallback(() => {
    window.location.assign(identityLoginAddUrl());
  }, []);

  const signOutThis = useCallback(async () => {
    await clearProductSessionOnly();
    const { user: remaining } = await logoutIdentityAccount(false);
    if (remaining?.id) {
      silentProductStart(wazenWorkspacePath());
    } else {
      window.location.replace(buildEndSessionUrl(false));
    }
    await new Promise<never>(() => {});
  }, []);

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
