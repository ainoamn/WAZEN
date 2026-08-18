import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";
import { sessionCookieFromStore } from "../../lib/session-policy";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; local?: string }>;
}) {
  const params = await searchParams;
  const jar = await cookies();
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/home";
  if (sessionCookieFromStore(jar)) redirect(next);
  const identityEnabled = isBhdIdentityConfigured();
  if (identityEnabled && params.local !== "1" && !params.error) {
    redirect(`/api/auth/bhd/start?next=${encodeURIComponent(next)}`);
  }
  return (
    <AuthForm
      mode="login"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
    />
  );
}
