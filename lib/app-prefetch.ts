"use client";

import { fetchAdminConsole } from "./admin-session";
import { readDashboardCache } from "./dashboard-session";
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
let warmTimer: ReturnType<typeof setTimeout> | null = null;

type PrefetchRouter = { prefetch: (href: string) => void };

function roleOf() {
  const cached = readDashboardCache<{ user?: { role?: string } }>();
  return cached?.user?.role;
}

/** Prefetch route JS only — never compete with the page's own data fetch. */
export function prefetchAppRoutes(router: PrefetchRouter, role = roleOf()) {
  for (const href of APP_PREFETCH_PATHS) {
    if (href === "/admin" && role && !canOpenPlatformConsole(role)) continue;
    void router.prefetch(href);
  }
}

/** Warm billing/documents after the current page has loaded. */
export function warmAppCaches(role = roleOf()) {
  if (warmed && readDashboardCache()) return;
  warmed = true;
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    warmTimer = null;
    void fetchPageCache("billing", "/api/platform?view=billing").catch(() => {});
    void fetchPageCache("documents", "/api/platform?view=documents").catch(() => {});
    void fetchPageCache("pricing", "/api/platform?view=pricing").catch(() => {});
    if (canOpenPlatformConsole(role)) void fetchAdminConsole().catch(() => {});
  }, 1500);
}

export function prefetchApp(router: PrefetchRouter, role = roleOf()) {
  prefetchAppRoutes(router, role);
}

export function resetAppPrefetch() {
  warmed = false;
  if (warmTimer) {
    clearTimeout(warmTimer);
    warmTimer = null;
  }
}

export function enterSignedInApp(
  router: PrefetchRouter & { push: (href: string) => void },
  dest: string,
  role?: string,
) {
  resetAppPrefetch();
  prefetchAppRoutes(router, role);
  router.push(dest);
}
