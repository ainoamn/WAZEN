/** Queue mutating API calls while offline and replay them when the network returns. */

export const OFFLINE_QUEUE_KEY = "wazen-offline-queue";
export const OFFLINE_QUEUE_EVENT = "wazen-offline-queue";
export const OFFLINE_QUEUE_LIMIT = 80;

export type OfflineQueuedRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  at: number;
};

export type OfflineStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function defaultStorage(): OfflineStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
}

export function canQueueOffline(url: string, method: string) {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
  let path = url;
  try {
    path = new URL(url, "https://wazen.bhd-om.com").pathname;
  } catch {
    /* keep raw */
  }
  if (path.startsWith("/api/auth") || path.startsWith("/api/health") || path.startsWith("/api/jobs")) return false;
  if (path.includes("checkout") || path.includes("payment")) return false;
  return path.startsWith("/api/dashboard") || path.startsWith("/api/v1/");
}

export function readOfflineQueue(storage: OfflineStorage | null = defaultStorage()): OfflineQueuedRequest[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedRequest[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.url === "string") : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: OfflineQueuedRequest[], storage: OfflineStorage | null = defaultStorage()) {
  if (!storage) return;
  try {
    if (!items.length) storage.removeItem(OFFLINE_QUEUE_KEY);
    else storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-OFFLINE_QUEUE_LIMIT)));
  } catch {
    /* quota / private mode */
  }
  emitQueueChanged();
}

export function clearOfflineQueue(storage: OfflineStorage | null = defaultStorage()) {
  writeOfflineQueue([], storage);
}

export function enqueueOfflineRequest(
  input: { url: string; method: string; headers?: Record<string, string>; body: string },
  storage: OfflineStorage | null = defaultStorage(),
): OfflineQueuedRequest | null {
  if (!canQueueOffline(input.url, input.method)) return null;
  const item: OfflineQueuedRequest = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}`,
    url: input.url,
    method: input.method.toUpperCase(),
    headers: input.headers ?? {},
    body: input.body,
    at: Date.now(),
  };
  const next = [...readOfflineQueue(storage), item];
  writeOfflineQueue(next, storage);
  return item;
}

export function offlineQueuedResponse() {
  return new Response(JSON.stringify({ ok: true, offlineQueued: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}

export function isNetworkFailure(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const message = error.message.toLowerCase();
  return name === "TypeError" || name === "AbortError" || message.includes("failed to fetch") || message.includes("network");
}

export async function flushOfflineQueue(
  fetchImpl: typeof fetch = fetch,
  storage: OfflineStorage | null = defaultStorage(),
): Promise<{ sent: number; remaining: number }> {
  const queue = readOfflineQueue(storage);
  if (!queue.length) return { sent: 0, remaining: 0 };
  const leftover: OfflineQueuedRequest[] = [];
  let sent = 0;
  let blocked = false;
  for (const item of queue) {
    if (blocked) {
      leftover.push(item);
      continue;
    }
    try {
      const headers = new Headers(item.headers);
      const response = await fetchImpl(item.url, {
        method: item.method,
        headers,
        body: item.body,
        credentials: "same-origin",
      });
      if (response.status === 401 || response.status === 429) {
        leftover.push(item);
        blocked = true;
        continue;
      }
      if (response.status >= 500) {
        leftover.push(item);
        blocked = true;
        continue;
      }
      sent += 1;
    } catch {
      leftover.push(item);
      blocked = true;
    }
  }
  writeOfflineQueue(leftover, storage);
  return { sent, remaining: leftover.length };
}

export function notifyOfflineCachesCleared() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "CLEAR_OFFLINE_DATA" });
  }).catch(() => {});
}
