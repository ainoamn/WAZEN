import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { isBhdIdentityConfigured } from "../../lib/bhd-identity";
import { googleClientId } from "../../lib/google-oauth";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default function RegisterPage() {
  const identityEnabled = isBhdIdentityConfigured();
  return (
    <AuthForm
      mode="register"
      googleClientId={identityEnabled ? "" : googleClientId()}
      identityEnabled={identityEnabled}
    />
  );
}
