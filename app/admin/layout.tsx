"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { AdminShell, useCommerceLocale } from "../commercial-kit";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale } = useCommerceLocale();
  if (pathname.startsWith("/admin/setup")) return children;
  return (
    <AdminShell locale={locale} setLocale={setLocale}>
      {children}
    </AdminShell>
  );
}
