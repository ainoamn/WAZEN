import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureSchema, getRawDb } from "../../db/runtime";
import { authenticateRequest } from "../../lib/auth";
import { signInEntryPath } from "../../lib/bhd-identity";
import { nextServerRequest } from "../../lib/server-request";
import { HomeClient } from "./home-client";

export const metadata: Metadata = { title: "الرئيسية" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = getRawDb();
  await ensureSchema(db);
  const request = await nextServerRequest("/home");
  const user = await authenticateRequest(db, request);
  if (!user) redirect(signInEntryPath("/home", request));
  return <HomeClient />;
}
