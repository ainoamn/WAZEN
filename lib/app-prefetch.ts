"use client";

import { fetchAdminConsole } from "./admin-session";
import { fetchDashboardSession, readDashboardCache } from "./dashboard-session";
import { fetchPageCache } from "./page-cache";
import { canOpenPlatformConsole } from "./platform-console";

export const APP_PREFETCH_PATHS = [
  "/home",
  "/dashboard",
  "/billing",
  "/documents",
  "/pricing",
  "/admin",
] as const;

let warmed = false;

type PrefetchRouter = { prefetch: (href: string) => void };

function roleOf() {
  const cached = readDashboardCache<{ user?: { role?: string } }>();
  return cached?.user?.role;
}

/** Prefetch route JS and warm API caches so the next click paints immediately. */
export function prefetchApp(router: PrefetchRouter, role = roleOf()) {
  for (const href of APP_PREFETCH_PATHS) {
    if (href === "/admin" && role && !canOpenPlatformConsole(role)) continue;
    void router.prefetch(href);
  }
  if (warmed && readDashboardCache()) return;
  warmed = true;
  void fetchDashboardSession().catch(() => { warmed = false; });
  void fetchPageCache("billing", "/api/platform?view=billing").catch(() => {});
  void fetchPageCache("documents", "/api/platform?view=documents").catch(() => {});
  void fetchPageCache("pricing", "/api/platform?view=pricing").catch(() => {});
  if (canOpenPlatformConsole(role)) {
    void fetchAdminConsole().catch(() => {});
  }
}

export function resetAppPrefetch() {
  warmed = false;
}

/** After a successful sign-in: start warming caches and open the destination immediately. */
export function enterSignedInApp(
  router: PrefetchRouter & { push: (href: string) => void },
  dest: string,
  role?: string,
) {
  resetAppPrefetch();
  prefetchApp(router, role);
  router.push(dest);
}
