import type { Metadata } from "next";
import { AdminPlans } from "../admin-plans-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الباقات والاشتراكات | وازن" };

export default function AdminPlansPage() {
  return <AdminPlans />;
}
