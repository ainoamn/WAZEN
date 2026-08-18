import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { googleClientId } from "../../lib/google-oauth";
import { sessionCookieFromStore } from "../../lib/session-policy";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default async function RegisterPage() {
  const jar = await cookies();
  if (sessionCookieFromStore(jar)) redirect("/home");
  return <AuthForm mode="register" googleClientId={googleClientId()} />;
}
