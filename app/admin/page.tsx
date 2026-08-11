import type { Metadata } from "next";
import { AdminOverview } from "./admin-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "إدارة المنصة" };
export default function AdminPage(){return <AdminOverview/>}
