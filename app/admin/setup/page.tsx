import { Suspense } from "react";
import AdminSetupClient from "./setup-client";

export const dynamic = "force-dynamic";

export default function AdminSetupPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading…</main>}>
      <AdminSetupClient />
    </Suspense>
  );
}
