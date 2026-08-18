import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { sessionCookieName } from "../../lib/session-policy";

export const metadata: Metadata = { title: "إنشاء حساب" };

function sessionCookieValue(jar: Awaited<ReturnType<typeof cookies>>) {
  return jar.get(sessionCookieName())?.value
    || jar.get("wazen_session")?.value
    || jar.get("__Host-wazen_session")?.value
    || "";
}

export default async function RegisterPage() {
  const jar = await cookies();
  if (sessionCookieValue(jar)) redirect("/home");
  return <AuthForm mode="register" />;
}
