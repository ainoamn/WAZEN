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

    const unsub = subscribeBrowserSessionChange(() => { void reconcile(); });
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void reconcile();
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pathname, router]);

  return null;
}
