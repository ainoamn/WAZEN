import type { Metadata } from "next";
import { Suspense } from "react";
import WazenPageLoader from "../../components/brand/WazenPageLoader";
import { HomeClient } from "./home-client";

export const metadata: Metadata = { title: "الرئيسية" };
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <Suspense fallback={<WazenPageLoader label="…" />}>
      <HomeClient />
    </Suspense>
  );
}
