"use client";

import { clearAdminConsole } from "./admin-session";
import { notifyBrowserSessionChange } from "./browser-session-client";
import { apiFetch } from "./client-api";
import { clearDashboardCache } from "./dashboard-session";
import { resetAppPrefetch } from "./app-prefetch";

export async function completeClientLogout() {
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
        /* stay on product login */
      }
    }
  } catch {
    /* still leave the product session */
  }
  clearAdminConsole();
  clearDashboardCache();
  resetAppPrefetch();
  notifyBrowserSessionChange(null);
  // After product logout: identity end-session, else BHD start (never parallel local admin).
  window.location.assign(endSessionUrl || "/api/auth/bhd/logout");
}
