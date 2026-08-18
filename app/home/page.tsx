import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieFromStore } from "../../lib/session-policy";
import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الرئيسية" };

export default async function HomePage() {
  const jar = await cookies();
  if (!sessionCookieFromStore(jar)) {
    redirect("/login?next=/home");
  }
  return <HomeClient />;
}
