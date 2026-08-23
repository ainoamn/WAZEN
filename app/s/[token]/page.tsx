import type { Metadata } from "next";
import StatementShareClient from "./statement-share-client";

export const metadata: Metadata = {
  title: "كشف وازن | WAZEN statement",
  robots: { index: false, follow: false },
};

export default async function StatementSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StatementShareClient token={token} />;
}
