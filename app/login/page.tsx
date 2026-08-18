import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { sessionCookieName } from "../../lib/session-policy";

export const metadata: Metadata = { title: "تسجيل الدخول" };

function sessionCookieValue(jar: Awaited<ReturnType<typeof cookies>>) {
  return jar.get(sessionCookieName())?.value
    || jar.get("wazen_session")?.value
    || jar.get("__Host-wazen_session")?.value
    || "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const jar = await cookies();
  if (sessionCookieValue(jar)) {
    const next = params.next;
    redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/home");
  }
  return <AuthForm mode="login" />;
}
