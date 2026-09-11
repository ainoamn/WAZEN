/** JSON cache so billing/documents/pricing open offline from the last visit. */

type Entry = { data: unknown; at: number };

const FRESH_MS = 45_000;
const STORAGE_KEY = "wazen-page-cache";
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let hydrated = false;

function storageOf(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const storage = storageOf();
  if (!storage) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    for (const [key, entry] of Object.entries(parsed || {})) {
      if (entry && typeof entry.at === "number") store.set(key, entry);
    }
  } catch {
    /* ignore */
  }
}

function persist() {
  const storage = storageOf();
  if (!storage) return;
  try {
    const dump: Record<string, Entry> = {};
    for (const [key, entry] of store) dump[key] = entry;
    storage.setItem(STORAGE_KEY, JSON.stringify(dump));
  } catch {
    /* quota */
  }
}

export function readPageCache<T>(key: string): T | null {
  hydrate();
  return (store.get(key)?.data as T | undefined) ?? null;
}

export function writePageCache(key: string, data: unknown) {
  hydrate();
  store.set(key, { data, at: Date.now() });
  persist();
}

export function clearPageCache(key?: string) {
  hydrate();
  if (key) {
    store.delete(key);
    inflight.delete(key);
    persist();
    return;
  }
  store.clear();
  inflight.clear();
  const storage = storageOf();
  try { storage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export async function fetchPageCache<T>(key: string, url: string, force = false): Promise<T> {
  hydrate();
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
  })().catch((caught) => {
    const cached = readPageCache<T>(key);
    if (cached && (caught as { status?: number }).status !== 401) return cached;
    throw caught;
  });

  inflight.set(key, request);
  try {
    return await request as T;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}
