import type { Metadata } from "next";
import ReceiptShareClient from "./receipt-share-client";

export const metadata: Metadata = {
  title: "إيصال وازن | WAZEN receipt",
  robots: { index: false, follow: false },
};

export default async function ReceiptSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReceiptShareClient token={token} />;
}
