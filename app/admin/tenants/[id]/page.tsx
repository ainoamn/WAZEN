import type { Metadata } from "next";
import { AdminTenantDetail } from "../../admin-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تفاصيل المستأجر | Tenant" };

export default function AdminTenantDetailPage() {
  return <AdminTenantDetail />;
}
