import { Suspense } from "react";
import type { Metadata } from "next";
import { WazenDashboard } from "../wazen-dashboard";

export const metadata: Metadata = { title: "لوحة المستخدم" };

export default function DashboardPage() {
  return (
    <Suspense>
      <WazenDashboard />
    </Suspense>
  );
}
