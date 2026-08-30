import type { Metadata } from "next";
import { PasswordRecovery } from "../password-recovery";

export const metadata: Metadata = { title: "كلمة مرور جديدة" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const params = await searchParams;
  return <PasswordRecovery mode="reset" token={params.token ?? ""} next={params.next ?? "/home"} />;
}
