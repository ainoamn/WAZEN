/** In-memory dashboard payload so Home ↔ Control does not re-splash. */

import { clearPageCache } from "./page-cache";

type CacheEntry = { data: unknown; at: number };

let cache: CacheEntry | null = null;
let inflight: Promise<unknown> | null = null;

const FRESH_MS = 20_000;
const FETCH_MS = 12_000;

export function readDashboardCache<T>(): T | null {
  return (cache?.data as T | undefined) ?? null;
}

export function writeDashboardCache(data: unknown) {
  cache = { data, at: Date.now() };
}

export function clearDashboardCache() {
  cache = null;
  inflight = null;
  clearPageCache();
}

function loadFailed(status: number) {
  const error = new Error("LOAD_FAILED") as Error & { status: number };
  error.status = status;
  return error;
}

export async function fetchDashboardSession<T>(force = false): Promise<{ status: number; data: T | null }> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) {
    return { status: 200, data: cache.data as T };
  }
  if (!force && inflight) {
    try {
      const data = await inflight as T;
      return { status: 200, data };
    } catch (caught) {
      if ((caught as { status?: number }).status === 401) throw caught;
      inflight = null;
    }
  }
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_MS);
    let raceTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutGuard = new Promise<never>((_, reject) => {
      raceTimer = setTimeout(() => {
        controller.abort();
        reject(loadFailed(504));
      }, FETCH_MS);
    });
    try {
      const response = await Promise.race([
        fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
        timeoutGuard,
      ]);
      if (response.status === 401) {
        cache = null;
        clearPageCache();
        const error = new Error("AUTHENTICATION_REQUIRED") as Error & { status: number };
        error.status = 401;
        throw error;
      }
      if (!response.ok) throw loadFailed(response.status);
      const data = await response.json() as { user?: { displayName?: string }; error?: string };
      if (!data || typeof data !== "object" || !data.user) throw loadFailed(502);
      writeDashboardCache(data);
      return data;
    } catch (caught) {
      if ((caught as { status?: number }).status === 401) throw caught;
      if (controller.signal.aborted || (caught as { status?: number }).status === 504) throw loadFailed(504);
      throw caught instanceof Error && "status" in caught ? caught : loadFailed(502);
    } finally {
      clearTimeout(timer);
      if (raceTimer !== undefined) clearTimeout(raceTimer);
    }
  })();
  inflight = request;
  try {
    const data = await request as T;
    return { status: 200, data };
  } finally {
    if (inflight === request) inflight = null;
  }
}

export function dashboardCacheIsFresh() {
  return Boolean(cache && Date.now() - cache.at < FRESH_MS);
}
