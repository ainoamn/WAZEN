"use client";

import { useEffect, useState } from "react";
import { BhdPrivacyGate } from "./BhdPrivacyGate";

/** Loads product session once for authenticated shells (client-only layouts). */
export function BhdPrivacyGateProduct() {
  const [session, setSession] = useState<{ sub?: string; email?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((data: { user?: { id?: string; bhdSub?: string | null; email?: string } | null }) => {
        if (cancelled || !data.user) return;
        setSession({
          sub: data.user.bhdSub || data.user.id,
          email: data.user.email,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session?.sub) return null;
  return <BhdPrivacyGate productSub={session.sub} productEmail={session.email} />;
}
