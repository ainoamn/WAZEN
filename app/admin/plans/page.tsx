import type { Metadata } from "next";
import { AdminPlans } from "../admin-plans-client";

export const metadata: Metadata = { title: "الباقات والاشتراكات | Plans" };

export default function AdminPlansPage() {
  return <AdminPlans />;
}
