import type { Metadata } from "next";
import { AdminPlans } from "../billing-admin-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الباقات والاشتراكات | وازن" };

export default function AdminPlansPage() {
  return <AdminPlans />;
}
