import type { Metadata } from "next";
import { AdminUsers } from "../admin-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المستخدمون والعملاء | Users" };
export default function AdminUsersPage(){return <AdminUsers/>}
