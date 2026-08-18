import type { Metadata } from "next";
import { AdminUsers } from "../admin-client";
export const metadata: Metadata = { title: "المستخدمون والعملاء | Users" };
export default function AdminUsersPage(){return <AdminUsers/>}
