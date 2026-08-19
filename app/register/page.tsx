import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured, isBhdSsoReadyForOrigin } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";
import { originFromHeaders } from "../../lib/server-request";

export const metadata: Metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; error?: string }>;
}) {
  await searchParams;
  const hdrs = await headers();
  const identityEnabled = isBhdIdentityConfigured();
  const ssoReady = identityEnabled && isBhdSsoReadyForOrigin(originFromHeaders(hdrs));
  return (
    <AuthForm
      mode="register"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
      ssoReady={ssoReady}
    />
  );
}
