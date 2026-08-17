"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const BUILD_POLL_MS = 45_000;
const DATA_POLL_MS = 4_000;
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
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector("input:focus, textarea:focus, select:focus")) return;
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
      }
    };
    const timer = window.setInterval(() => { if (!stopped) void check(); }, BUILD_POLL_MS);
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
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;

    const refresh = () => { onChangeRef.current(); };
    const pull = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const next = await fetchDashboardRevision();
      if (next == null) return;
      if (!revision) {
        revision = next;
        return;
      }
      if (next !== revision) {
        revision = next;
        refresh();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    channel?.addEventListener("message", (event: MessageEvent) => {
      if (event.data === "refresh") refresh();
    });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    timer = window.setInterval(() => { void pull(); }, DATA_POLL_MS);
    void pull();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      channel?.close();
    };
  }, [enabled]);
}
