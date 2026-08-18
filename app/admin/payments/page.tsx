import type { Metadata } from "next";
import { AdminPayments } from "../admin-client";
export const metadata: Metadata = { title: "المدفوعات والفواتير | Payments" };
export default function AdminPaymentsPage(){return <AdminPayments/>}
