import type { Metadata } from "next";
import { HomeClient } from "./home-client";

export const metadata: Metadata = { title: "الرئيسية" };
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <HomeClient />;
}
