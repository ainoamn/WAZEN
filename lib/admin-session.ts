/** Shared admin console payload so sidebar pages do not each wait 30–50s on Neon. */

export type AdminConsolePayload = {
  user: Record<string, unknown>;
  role: string;
  users: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  coupons: Record<string, unknown>[];
  plans: Record<string, unknown>[];
  roles: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  alerts?: Array<{ id: string; severity: string; href?: string; ar: string; en: string; count?: number }>;
  platform?: {
    spaces: number;
    members: number;
    transactions: number;
    countries: number;
    monthlyRevenue?: Array<{ month: string; total: number }>;
  };
  gateways?: Record<string, unknown>[];
  tenantsPage?: { items: Record<string, unknown>[]; total: number; page: number; pageSize: number };
};

const FRESH_MS = 120_000;

let cache: { data: AdminConsolePayload; at: number } | null = null;
let inflight: Promise<AdminConsolePayload> | null = null;

export const ADMIN_PREFETCH_PATHS = [
  "/admin",
  "/admin/users",
  "/admin/tenants",
  "/admin/staff",
  "/admin/plans",
  "/admin/gateways",
  "/admin/payments",
  "/admin/reports",
] as const;

export function readAdminConsole<T = AdminConsolePayload>(): T | null {
  return (cache?.data as T | undefined) ?? null;
}

export function patchAdminConsole(partial: Partial<AdminConsolePayload>) {
  if (!cache) return;
  cache = { data: { ...cache.data, ...partial }, at: Date.now() };
}

export function writeAdminConsole(data: AdminConsolePayload) {
  cache = { data, at: Date.now() };
}

export function clearAdminConsole() {
  cache = null;
  inflight = null;
}

function isFresh() {
  return Boolean(cache && Date.now() - cache.at < FRESH_MS);
}

export async function fetchAdminConsole(force = false): Promise<AdminConsolePayload> {
  if (!force && cache) {
    if (!isFresh() && !inflight) void fetchAdminConsole(true);
    return cache.data;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let raceTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutGuard = new Promise<never>((_, reject) => {
      raceTimer = setTimeout(() => reject(new Error("LOAD")), 15_000);
    });
    try {
      const response = await Promise.race([
        fetch("/api/platform?view=admin&scope=console", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        }),
        timeoutGuard,
      ]);
      if (response.status === 401) {
        clearAdminConsole();
        const error = new Error("AUTH");
        throw error;
      }
      const result = await response.json() as AdminConsolePayload & { error?: string };
      if (!response.ok) {
        clearAdminConsole();
        throw new Error(result.error === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      }
      writeAdminConsole(result);
      return result;
    } catch (caught) {
      if (caught instanceof Error && caught.message === "AUTH") throw caught;
      if (controller.signal.aborted) throw new Error("LOAD");
      throw caught instanceof Error ? caught : new Error("LOAD");
    } finally {
      clearTimeout(timer);
      if (raceTimer !== undefined) clearTimeout(raceTimer);
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
