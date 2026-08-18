import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; error?: string }>;
}) {
  const params = await searchParams;
  const identityEnabled = isBhdIdentityConfigured();
  if (identityEnabled && params.local !== "1" && !params.error) {
    redirect("/api/auth/bhd/start?next=%2Fhome");
  }
  return (
    <AuthForm
      mode="register"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
    />
  );
}
