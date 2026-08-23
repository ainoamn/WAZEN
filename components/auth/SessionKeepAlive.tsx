"use client";

import { useEffect } from "react";

const IDLE_PING_MS = 60_000;

/** Renew product session idle window on use (BHD §0.2 — mirrors identity SessionKeepAlive). */
export function SessionKeepAlive() {
  useEffect(() => {
    let last = 0;
    let cancelled = false;

    const ping = () => {
      const now = Date.now();
      if (now - last < IDLE_PING_MS) return;
      last = now;
      void fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    };

    const onUse = () => ping();
    ping();
    window.addEventListener("pointerdown", onUse);
    window.addEventListener("keydown", onUse);
    window.addEventListener("focus", onUse);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) ping();
    });
    const interval = window.setInterval(() => {
      if (!cancelled && !document.hidden) ping();
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onUse);
      window.removeEventListener("keydown", onUse);
      window.removeEventListener("focus", onUse);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
