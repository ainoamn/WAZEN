import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  const identityEnabled = isBhdIdentityConfigured();
  return (
    <AuthForm
      mode="login"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
    />
  );
}
