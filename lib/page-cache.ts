/** In-memory JSON cache so billing/documents/pricing open from a prior visit without a splash. */

type Entry = { data: unknown; at: number };

const FRESH_MS = 45_000;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function readPageCache<T>(key: string): T | null {
  return (store.get(key)?.data as T | undefined) ?? null;
}

export function writePageCache(key: string, data: unknown) {
  store.set(key, { data, at: Date.now() });
}

export function clearPageCache(key?: string) {
  if (key) {
    store.delete(key);
    inflight.delete(key);
    return;
  }
  store.clear();
  inflight.clear();
}

export async function fetchPageCache<T>(key: string, url: string, force = false): Promise<T> {
  if (!force) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.data as T;
    if (hit) {
      if (!inflight.has(key)) void fetchPageCache<T>(key, url, true);
      return hit.data as T;
    }
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) {
      const error = new Error("AUTHENTICATION_REQUIRED") as Error & { status: number };
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const error = new Error("LOAD_FAILED") as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const data = await response.json() as T;
    writePageCache(key, data);
    return data;
  })();

  inflight.set(key, request);
  try {
    return await request as T;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}
