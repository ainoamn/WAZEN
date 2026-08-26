import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured, isBhdSsoReadyForOrigin, safeReturnTo } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";
import { originFromHeaders } from "../../lib/server-request";

export const metadata: Metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; error?: string; next?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const hdrs = await headers();
  const next = safeReturnTo(params.next || params.returnTo || "/home");
  const identityEnabled = isBhdIdentityConfigured();
  const origin = originFromHeaders(hdrs);
  const ssoReady = identityEnabled && isBhdSsoReadyForOrigin(origin);

  // Guide §4.9 / §0.7: admin never uses local password form.
  if (identityEnabled && next.startsWith("/admin")) {
    redirect(`/api/auth/admin-entry?next=${encodeURIComponent(next)}`);
  }

  // Guide §0.2 / §0.7: no parallel end-user local register on SSO origins.
  if (ssoReady) {
    redirect(`/api/auth/bhd/start?returnTo=${encodeURIComponent(next)}`);
  }

  return (
    <AuthForm
      mode="register"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
      ssoReady={ssoReady}
    />
  );
}
