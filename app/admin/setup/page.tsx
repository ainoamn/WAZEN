import { Suspense } from "react";
import AdminSetupClient from "./setup-client";

export const dynamic = "force-dynamic";

export default function AdminSetupPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>جاري التحميل… / Loading…</main>}>
      <AdminSetupClient />
    </Suspense>
  );
}
