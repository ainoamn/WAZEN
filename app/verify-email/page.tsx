import type { Metadata } from "next";
import { VerifyEmailClient } from "./verify-email-client";

export const metadata: Metadata = { title: "تأكيد البريد" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string; delivery?: string }>;
}) {
  const params = await searchParams;
  const delivery =
    params.delivery === "queued" || params.delivery === "deferred"
      ? params.delivery
      : params.sent === "1"
        ? "queued"
        : "unknown";
  return <VerifyEmailClient token={params.token ?? ""} sent={params.sent === "1"} delivery={delivery} />;
}
