import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeClient } from "./home-client";

export const metadata: Metadata = { title: "الرئيسية" };

export default function HomePage() {
  // No branded Suspense splash — HomeClient paints from local cache first (BHD nav policy).
  return (
    <Suspense fallback={null}>
      <HomeClient />
    </Suspense>
  );
}
