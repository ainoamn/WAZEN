import type { Metadata } from "next";
import { AdminTenants } from "../admin-detail-client";

export const metadata: Metadata = { title: "الشركات والمستأجرون | Tenants" };

export default function AdminTenantsPage() {
  return <AdminTenants />;
}
