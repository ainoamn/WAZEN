import type { Metadata } from "next"; import { InviteClient } from "./invite-client";
export const metadata: Metadata = { title: "قبول الدعوة" };
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const params = await searchParams; return <InviteClient token={params.token ?? ""} />; }

