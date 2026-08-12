import type { Metadata } from "next";
import { AdminTenants } from "../admin-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المستأجرون" };

export default function AdminTenantsPage() {
  return <AdminTenants />;
}
