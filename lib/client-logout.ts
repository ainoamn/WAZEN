"use client";

import { clearAdminConsole } from "./admin-session";
import { notifyBrowserSessionChange } from "./browser-session-client";
import { apiFetch } from "./client-api";
import { clearDashboardCache } from "./dashboard-session";
import { resetAppPrefetch } from "./app-prefetch";
import {
  applyAccountIsolation,
  buildEndSessionUrl,
  logoutIdentityAccount,
} from "./bhd-multi-account";

let clientLogoutInProgress = false;

/** True while product logout is clearing the session and navigating to identity end-session. */
export function isClientLogoutInProgress() {
  return clientLogoutInProgress;
}

async function clearProductSessionOnly() {
  try {
    await apiFetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  } catch {
    /* still leave the product session */
  }
  clearAdminConsole();
  clearDashboardCache();
  resetAppPrefetch();
  notifyBrowserSessionChange(null);
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("bhd-sso:")) sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Clears the Wazen session then navigates to identity end-session (or remaining account).
 * `all: true` (default for sidebar) ends every roster account.
 * `all: false` activates the next identity account and silent-starts the product.
 */
export async function completeClientLogout(options?: { all?: boolean }) {
  clientLogoutInProgress = true;
  const all = options?.all !== false;
  await clearProductSessionOnly();
  if (!all) {
    try {
      const remaining = await logoutIdentityAccount(false);
      if (remaining.user?.id) {
        applyAccountIsolation();
        await new Promise<never>(() => {});
      }
    } catch {
      /* fall through to end-session */
    }
  } else {
    try {
      await logoutIdentityAccount(true);
    } catch {
      /* still end-session */
    }
  }
  window.location.replace(buildEndSessionUrl(all));
  await new Promise<never>(() => {});
}
