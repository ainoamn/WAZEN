import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { googleClientId } from "../../lib/google-oauth";
import { sessionCookieFromStore } from "../../lib/session-policy";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const jar = await cookies();
  if (sessionCookieFromStore(jar)) {
    const next = params.next;
    redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/home");
  }
  return <AuthForm mode="login" googleClientId={googleClientId()} />;
}
