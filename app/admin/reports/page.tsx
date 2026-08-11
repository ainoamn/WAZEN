import type { Metadata } from "next";
import { AdminReports } from "../admin-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تقارير الإدارة" };
export default function AdminReportsPage(){return <AdminReports/>}
