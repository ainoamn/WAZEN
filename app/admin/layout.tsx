"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { AdminShell, useCommerceLocale } from "../commercial-kit";
import { ADMIN_PREFETCH_PATHS, fetchAdminConsole } from "../../lib/admin-session";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useCommerceLocale();

  useEffect(() => {
    if (pathname.startsWith("/admin/setup")) return;
    void fetchAdminConsole();
    for (const href of ADMIN_PREFETCH_PATHS) router.prefetch(href);
  }, [pathname, router]);

  if (pathname.startsWith("/admin/setup")) return children;
  return (
    <AdminShell locale={locale} setLocale={setLocale}>
      {children}
    </AdminShell>
  );
}
