import type { Metadata } from "next";
import { AdminUsers } from "../admin-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "إدارة المستخدمين" };
export default function AdminUsersPage(){return <AdminUsers/>}
