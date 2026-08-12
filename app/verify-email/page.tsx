import type { Metadata } from "next"; import { VerifyEmailClient } from "./verify-email-client";
export const metadata: Metadata = { title: "تأكيد البريد" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string }> }) { const params = await searchParams; return <VerifyEmailClient token={params.token ?? ""} sent={params.sent === "1"} />; }
