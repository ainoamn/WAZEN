import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured, isBhdSsoReadyForOrigin, safeReturnTo } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";
import { originFromHeaders } from "../../lib/server-request";

export const metadata: Metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; local?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const hdrs = await headers();
  const next = safeReturnTo(params.next || params.returnTo || "/home");
  const identityEnabled = isBhdIdentityConfigured();
  const origin = originFromHeaders(hdrs);
  const ssoReady = identityEnabled && isBhdSsoReadyForOrigin(origin);

  // Guide §4.9 / §0.7: admin never uses local password form.
  if (identityEnabled && params.local === "1" && next.startsWith("/admin")) {
    redirect(`/api/auth/admin-entry?next=${encodeURIComponent(next)}`);
  }

  // Production SSO origin: end-user login is identity only (no parallel local panel).
  if (ssoReady && params.local !== "1") {
    redirect(`/api/auth/bhd/start?returnTo=${encodeURIComponent(next)}`);
  }

  // Preview / emergency local=1 on non-SSO origins, or after SSO error with local=1.
  return (
    <AuthForm
      mode="login"
      next={next}
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
      ssoReady={ssoReady}
    />
  );
}
