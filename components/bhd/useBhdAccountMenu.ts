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

export function useBhdAccountMenu(productUser: BhdSwitcherUser, locale: "ar" | "en" = "ar") {
  const [user, setUser] = useState<BhdSwitcherUser>(productUser);
  const [accounts, setAccounts] = useState<BhdSwitcherUser[]>([productUser]);

  useEffect(() => {
    setUser((current) => ({
      ...productUser,
      id: current.id || productUser.id,
    }));
  }, [productUser.id, productUser.name, productUser.email, productUser.picture]);

  useEffect(() => {
    let cancelled = false;
    void fetchIdentityAccounts()
      .then((data) => {
        if (cancelled) return;
        if (data.user) {
          setUser({
            id: data.user.id,
            name: data.user.name || productUser.name,
            email: data.user.email || productUser.email,
            picture: data.user.picture ?? productUser.picture,
          });
        }
        const list = data.accounts?.length
          ? data.accounts
          : data.user
            ? [data.user]
            : [productUser];
        setAccounts(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([productUser]);
      });
    return () => {
      cancelled = true;
    };
  }, [productUser.email, productUser.name, productUser.picture, productUser.id]);

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
