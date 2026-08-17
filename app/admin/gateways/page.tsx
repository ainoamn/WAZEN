import type { Metadata } from "next";
import { AdminGateways } from "../billing-admin-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "بوابات الدفع | Gateways" };

export default function AdminGatewaysPage() {
  return <AdminGateways />;
}
