import type { Metadata } from "next";
import { AdminStaff } from "../admin-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "فريق الإدارة | Staff" };

export default function AdminStaffPage() {
  return <AdminStaff />;
}
