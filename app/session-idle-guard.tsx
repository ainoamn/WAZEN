"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAdminConsole } from "../lib/admin-session";
import { apiFetch } from "../lib/client-api";
import { clearDashboardCache } from "../lib/dashboard-session";
import { SESSION_IDLE_MS } from "../lib/session-policy";

const GUARDED = ["/home", "/dashboard", "/billing", "/documents", "/admin", "/account"];

function isGuarded(pathname: string) {
  if (pathname.startsWith("/admin/setup")) return false;
  return GUARDED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function SessionIdleGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isGuarded(pathname)) return;
    let lastActivity = Date.now();
    let timer = 0;
    let expired = false;

    const expire = async () => {
      if (expired) return;
      expired = true;
      try {
        await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      } catch {
        /* cookie clear still attempted below via navigation */
      }
      clearAdminConsole();
      clearDashboardCache();
      router.replace("/login");
      router.refresh();
    };

    const check = () => {
      if (Date.now() - lastActivity >= SESSION_IDLE_MS) void expire();
    };
    const mark = () => {
      lastActivity = Date.now();
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    for (const event of events) window.addEventListener(event, mark, { passive: true });
    document.addEventListener("visibilitychange", check);
    timer = window.setInterval(check, 15_000);
    return () => {
      for (const event of events) window.removeEventListener(event, mark);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
