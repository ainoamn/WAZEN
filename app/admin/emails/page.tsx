import type { Metadata } from "next";
import { AdminEmails } from "../admin-emails-client";

export const metadata: Metadata = { title: "قوالب البريد | Email templates" };

export default function AdminEmailsPage() {
  return <AdminEmails />;
}
