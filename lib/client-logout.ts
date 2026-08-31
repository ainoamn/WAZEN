"use client";

import { clearAdminConsole } from "./admin-session";
import { notifyBrowserSessionChange } from "./browser-session-client";
import { apiFetch } from "./client-api";
import { clearDashboardCache } from "./dashboard-session";
import { resetAppPrefetch } from "./app-prefetch";

let clientLogoutInProgress = false;

/** True while product logout is clearing the session and navigating to identity end-session. */
export function isClientLogoutInProgress() {
  return clientLogoutInProgress;
}

/**
 * Clears the Wazen session then navigates to identity end-session (or `/api/auth/bhd/logout`).
 * Do not call `location.replace(signIn…)` afterward — that re-opens SSO while identity is still alive.
 * This promise intentionally never resolves after navigation starts so awaiters cannot race.
 */
export async function completeClientLogout() {
  clientLogoutInProgress = true;
  let endSessionUrl = "";
  try {
    const response = await apiFetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    const result = await response.json() as { endSessionUrl?: string };
    if (typeof result.endSessionUrl === "string") {
      try {
        const url = new URL(result.endSessionUrl);
        const identityHost = url.hostname.toLowerCase();
        const allowed = identityHost === "id.bhd-om.com"
          || identityHost === "one-bhd.vercel.app"
          || identityHost === "localhost";
        if ((url.protocol === "https:" || (url.protocol === "http:" && identityHost === "localhost")) && allowed) {
          endSessionUrl = result.endSessionUrl;
        }
      } catch {
        /* stay on product logout route */
      }
    }
  } catch {
    /* still leave the product session */
  }
  clearAdminConsole();
  clearDashboardCache();
  resetAppPrefetch();
  notifyBrowserSessionChange(null);
  window.location.replace(endSessionUrl || "/api/auth/bhd/logout");
  await new Promise<never>(() => {});
}
