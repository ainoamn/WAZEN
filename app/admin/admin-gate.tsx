"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { AdminShell, Brand, PageLoader, useCommerceLocale } from "../commercial-kit";
import { ADMIN_PREFETCH_PATHS, clearAdminConsole, fetchAdminConsole, readAdminConsole } from "../../lib/admin-session";
import { goToSignIn } from "../../lib/client-sign-in";
import { prefetchAppRoutes } from "../../lib/app-prefetch";
import { clearDashboardCache, readDashboardCache } from "../../lib/dashboard-session";
import { canOpenPlatformConsole } from "../../lib/platform-console";

type Gate = "pending" | "forbidden" | "ok" | "failed";

function initialAdminGate(): Gate {
  const admin = readAdminConsole();
  if (admin && canOpenPlatformConsole(admin.role)) return "ok";
  const dash = readDashboardCache<{ user?: { role?: string } }>();
  if (dash?.user?.role && canOpenPlatformConsole(dash.user.role)) return "ok";
  if (dash?.user?.role && !canOpenPlatformConsole(dash.user.role)) return "forbidden";
  return "pending";
}

export function AdminConsoleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [gate, setGate] = useState<Gate>(initialAdminGate);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (pathname.startsWith("/admin/setup")) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    let raceTimer = 0;
    void (async () => {
      const timeoutGuard = new Promise<never>((_, reject) => {
        raceTimer = window.setTimeout(() => reject(new DOMException("Timeout", "AbortError")), 20_000);
      });
      const response = await Promise.race([
        fetch("/api/auth", { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
        timeoutGuard,
      ]);
      if (cancelled) return;
      if (response.status === 401) {
        clearAdminConsole();
        clearDashboardCache();
        goToSignIn(pathname);
        return;
      }
      const result = await response.json() as { authenticated?: boolean; role?: string };
      if (!canOpenPlatformConsole(result.role)) {
        clearAdminConsole();
        setGate("forbidden");
        return;
      }
      setGate("ok");
      void fetchAdminConsole();
      prefetchAppRoutes(router, result.role);
      for (const href of ADMIN_PREFETCH_PATHS) router.prefetch(href);
    })().catch(() => {
      if (!cancelled) setGate("failed");
    }).finally(() => {
      window.clearTimeout(timer);
      window.clearTimeout(raceTimer);
    });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(raceTimer);
    };
  }, [pathname, router, attempt]);

  if (pathname.startsWith("/admin/setup")) return children;

  if (gate === "forbidden") {
    return (
      <main className="admin-access-denied">
        <Brand compact />
        <b>{l("لا تملك صلاحية دخول الإدارة", "You do not have admin access")}</b>
        <p>{l("هذه الصفحة لمديري المنصة فقط. لم تُعرض أي بيانات إدارية.", "This page is for platform administrators only. No admin data was shown.")}</p>
        <div>
          <Link href="/home">{l("العودة للرئيسية", "Back to home")}</Link>
          <Link href="/dashboard">{l("لوحة المستخدم", "Dashboard")}</Link>
        </div>
      </main>
    );
  }

  if (gate === "failed") {
    return (
      <main className="admin-access-denied">
        <Brand compact />
        <b>{l("تعذر التحقق من صلاحية الإدارة", "Could not verify admin access")}</b>
        <p>{l("تحقق من الاتصال ثم أعد المحاولة.", "Check your connection, then try again.")}</p>
        <div>
          <button type="button" className="primary-button" onClick={() => { setGate("pending"); setAttempt((current) => current + 1); }}>{l("إعادة المحاولة", "Try again")}</button>
          <Link href="/home">{l("العودة للرئيسية", "Back to home")}</Link>
        </div>
      </main>
    );
  }

  if (gate !== "ok") return <PageLoader label={l("جاري التحقق…", "Checking access…")} />;

  return (
    <AdminShell locale={locale} setLocale={setLocale}>
      {children}
    </AdminShell>
  );
}
