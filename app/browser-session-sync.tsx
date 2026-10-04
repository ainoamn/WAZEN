"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAdminConsole } from "../lib/admin-session";
import { goToSignIn } from "../lib/client-sign-in";
import { ensureBrowserId, subscribeBrowserSessionChange } from "../lib/browser-session-client";
import { clearDashboardCache, readDashboardCache } from "../lib/dashboard-session";

type CachedUser = { user?: { id?: string; email?: string } };

export function BrowserSessionSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    ensureBrowserId();
  }, []);

  useEffect(() => {
    let inflight = false;
    const reconcile = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
        const cached = readDashboardCache<CachedUser>();
        if (!response.ok) {
          if (cached) {
            clearDashboardCache();
            clearAdminConsole();
            if (!pathname.startsWith("/login") && !pathname.startsWith("/register")) {
              goToSignIn(pathname);
            }
          }
          return;
        }
        const result = await response.json() as CachedUser;
        const liveId = result.user?.id ?? "";
        const liveEmail = result.user?.email ?? "";
        const cachedId = cached?.user?.id ?? "";
        const cachedEmail = cached?.user?.email ?? "";
        const userChanged = (cachedId && liveId && cachedId !== liveId) || (cachedEmail && liveEmail && cachedEmail !== liveEmail);
        if (userChanged) {
          clearDashboardCache();
          clearAdminConsole();
          window.location.reload();
        }
      } catch {
        /* ignore */
      } finally {
        inflight = false;
      }
    };

    // Only explicit sign-in/out in another tab triggers reconcile — never tab focus/visibility (docs/BHD-SESSION-POLICY.md).
    const unsub = subscribeBrowserSessionChange(() => { void reconcile(); });
    void reconcile();
    return unsub;
  }, [pathname, router]);

  return null;
}
