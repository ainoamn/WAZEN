import type { Metadata } from "next";
import { SecurityClient } from "./security-client";

export const metadata: Metadata = { title: "أمان الحساب | Account security" };
export default function SecurityPage() { return <SecurityClient />; }
