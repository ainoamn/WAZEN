"use client";

const STORAGE_KEY = "wazen_browser_id";
const STAMP_KEY = "wazen_session_stamp";
const CHANNEL = "wazen-session";

function secureSuffix() {
  return typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
}

export function ensureBrowserId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    document.cookie = `wazen_browser=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=31536000${secureSuffix()}`;
    return id;
  } catch {
    return "";
  }
}

export function notifyBrowserSessionChange(userId: string | null) {
  const stamp = `${Date.now()}:${userId ?? ""}`;
  try {
    window.localStorage.setItem(STAMP_KEY, stamp);
  } catch {
    /* ignore */
  }
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type: "session", userId, stamp });
  } catch {
    /* ignore */
  }
}

export function subscribeBrowserSessionChange(handler: (payload: { userId: string | null; stamp: string }) => void) {
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STAMP_KEY || !event.newValue) return;
    const [, userId = ""] = event.newValue.split(":");
    handler({ userId: userId || null, stamp: event.newValue });
  };
  channel?.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "session") handler(event.data as { userId: string | null; stamp: string });
  });
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
