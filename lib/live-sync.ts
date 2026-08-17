"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const BUILD_POLL_MS = 60_000;
const DATA_POLL_MS = 12_000;
const DATA_POLL_MAX_MS = 60_000;
const CHANNEL = "wazen-live";

function currentBuildHint() {
  return document.documentElement.dataset.wazenBuild ?? "";
}

export async function fetchDashboardRevision() {
  const response = await fetch("/api/dashboard?view=revision", { cache: "no-store", credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) return null;
  const result = await response.json() as { revision?: string };
  return result.revision ?? "";
}

export function notifyLiveRefresh() {
  try {
    new BroadcastChannel(CHANNEL).postMessage("refresh");
  } catch {
    /* unsupported */
  }
}

/** Reload once Vercel ships a new git deployment, without a manual refresh. */
export function LiveBuildGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    let stopped = false;
    let seen = "";
    let inflight = false;
    const check = async () => {
      if (stopped || inflight) return;
      if (document.visibilityState !== "visible") return;
      if (document.querySelector("input:focus, textarea:focus, select:focus, [contenteditable='true']:focus")) return;
      inflight = true;
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const result = await response.json() as { buildId?: string; version?: string };
        const build = result.buildId || result.version || "";
        if (!build) return;
        if (!seen) {
          seen = build;
          document.documentElement.dataset.wazenBuild = build;
          return;
        }
        if (build !== seen && build !== currentBuildHint()) {
          window.location.reload();
        }
      } catch {
        /* ignore */
      } finally {
        inflight = false;
      }
    };
    const timer = window.setInterval(() => { void check(); }, BUILD_POLL_MS);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pathname]);
  return null;
}

/** Keep dashboard/home in sync across phone and desktop without a full reload. */
export function useLiveDashboard(onChange: () => void, enabled: boolean) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let revision = "";
    let timer = 0;
    let delay = DATA_POLL_MS;
    let inflight = false;
    let lastRefreshAt = 0;
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 1_500) return;
      lastRefreshAt = now;
      onChangeRef.current();
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void pull(); }, delay);
    };

    const pull = async () => {
      if (stopped || inflight) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      inflight = true;
      try {
        const next = await fetchDashboardRevision();
        if (next == null) {
          delay = Math.min(delay * 2, DATA_POLL_MAX_MS);
          return;
        }
        delay = DATA_POLL_MS;
        if (!revision) {
          revision = next;
          return;
        }
        if (next !== revision) {
          revision = next;
          refresh();
        }
      } catch {
        delay = Math.min(delay * 2, DATA_POLL_MAX_MS);
      } finally {
        inflight = false;
        if (!stopped) schedule();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        delay = DATA_POLL_MS;
        void pull();
      }
    };
    channel?.addEventListener("message", (event: MessageEvent) => {
      if (event.data === "refresh") refresh();
    });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void pull();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      channel?.close();
    };
  }, [enabled]);
}
