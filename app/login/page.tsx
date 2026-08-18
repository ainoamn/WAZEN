import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";

export const metadata: Metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; local?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/home";
  const identityEnabled = isBhdIdentityConfigured();
  if (identityEnabled && params.local !== "1" && !params.error) {
    redirect(`/api/auth/bhd/start?next=${encodeURIComponent(next)}`);
  }
  return (
    <AuthForm
      mode="login"
      next={next}
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
    />
  );
}
