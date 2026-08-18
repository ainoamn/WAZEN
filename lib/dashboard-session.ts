/** In-memory dashboard payload so Home ↔ Control does not re-splash. */

type CacheEntry = { data: unknown; at: number };

let cache: CacheEntry | null = null;
let inflight: Promise<unknown> | null = null;

const FRESH_MS = 20_000;

export function readDashboardCache<T>(): T | null {
  return (cache?.data as T | undefined) ?? null;
}

export function writeDashboardCache(data: unknown) {
  cache = { data, at: Date.now() };
}

export function clearDashboardCache() {
  cache = null;
  inflight = null;
}

export async function fetchDashboardSession<T>(force = false): Promise<{ status: number; data: T | null }> {
  if (!force && inflight) {
    const data = await inflight as T;
    return { status: 200, data };
  }
  if (!force && cache && Date.now() - cache.at < FRESH_MS) {
    return { status: 200, data: cache.data as T };
  }
  inflight = (async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) {
      clearDashboardCache();
      const error = new Error("AUTHENTICATION_REQUIRED") as Error & { status: number };
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const error = new Error("LOAD_FAILED") as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const data = await response.json() as { user?: { displayName?: string }; error?: string };
    if (!data || typeof data !== "object" || !data.user) {
      const error = new Error("LOAD_FAILED") as Error & { status: number };
      error.status = 502;
      throw error;
    }
    writeDashboardCache(data);
    return data;
  })();
  try {
    const data = await inflight as T;
    return { status: 200, data };
  } finally {
    inflight = null;
  }
}

export function dashboardCacheIsFresh() {
  return Boolean(cache && Date.now() - cache.at < FRESH_MS);
}
