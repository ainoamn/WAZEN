import type { Metadata } from "next";
import { AdminOverview } from "./admin-client";
export const metadata: Metadata = { title: "نظرة عامة | Overview" };
export default function AdminPage(){return <AdminOverview/>}
