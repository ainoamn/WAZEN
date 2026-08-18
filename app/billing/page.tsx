import type { Metadata } from "next";
import { BillingClient } from "./billing-client";
export const metadata: Metadata = { title: "الاشتراك والفوترة" };
export default function BillingPage() { return <BillingClient />; }
