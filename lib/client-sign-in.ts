"use client";

import { signInEntryPathForOrigin } from "./bhd-identity";

export function clientSignInPath(next: string) {
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  if (typeof window === "undefined") {
    return `/api/auth/bhd/start?next=${encodeURIComponent(safe)}`;
  }
  return signInEntryPathForOrigin(safe, window.location.origin);
}

export function goToSignIn(next: string) {
  window.location.replace(clientSignInPath(next));
}
