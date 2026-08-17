import type { Metadata } from "next";
import { AdminUserDetail } from "../../admin-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تفاصيل المستخدم | User" };

export default function AdminUserDetailPage() {
  return <AdminUserDetail />;
}
