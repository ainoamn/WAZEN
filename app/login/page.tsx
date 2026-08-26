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
  if (identityEnabled && next.startsWith("/admin")) {
    redirect(`/api/auth/admin-entry?next=${encodeURIComponent(next)}`);
  }

  // Production SSO origin: identity only — never honor local=1.
  // On OAuth errors, show a thin interstitial (no password panel) then retry BHD.
  if (ssoReady && !params.error) {
    redirect(`/api/auth/bhd/start?returnTo=${encodeURIComponent(next)}`);
  }

  return (
    <AuthForm
      mode="login"
      next={next}
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
      ssoReady={ssoReady}
      identityOnly={ssoReady}
    />
  );
}
