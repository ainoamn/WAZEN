"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { AdminShell, Brand, PageLoader, useCommerceLocale } from "../commercial-kit";
import { ADMIN_PREFETCH_PATHS, clearAdminConsole, fetchAdminConsole } from "../../lib/admin-session";
import { clearDashboardCache } from "../../lib/dashboard-session";
import { canOpenPlatformConsole } from "../../lib/platform-console";

type Gate = "pending" | "forbidden" | "ok";

export function AdminConsoleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [gate, setGate] = useState<Gate>("pending");

  useEffect(() => {
    if (pathname.startsWith("/admin/setup")) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
      if (cancelled) return;
      if (response.status === 401) {
        clearAdminConsole();
        clearDashboardCache();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
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
      for (const href of ADMIN_PREFETCH_PATHS) router.prefetch(href);
    })().catch(() => {
      if (!cancelled) {
        clearAdminConsole();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

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

  if (gate !== "ok") return <PageLoader label={l("جاري التحقق…", "Checking access…")} />;

  return (
    <AdminShell locale={locale} setLocale={setLocale}>
      {children}
    </AdminShell>
  );
}
