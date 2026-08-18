import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieFromStore } from "../../lib/session-policy";
import { WazenDashboard } from "../wazen-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "لوحة المستخدم" };

export default async function DashboardPage() {
  const jar = await cookies();
  if (!sessionCookieFromStore(jar)) {
    redirect("/login?next=/dashboard");
  }
  return (
    <Suspense>
      <WazenDashboard />
    </Suspense>
  );
}
