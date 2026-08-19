"use client";

import { signInEntryPathForOrigin } from "./bhd-identity";

export function clientSignInPath(next: string) {
  if (typeof window === "undefined") {
    return `/login?local=1&next=${encodeURIComponent(next.startsWith("/") ? next : "/home")}`;
  }
  return signInEntryPathForOrigin(next, window.location.origin);
}

export function goToSignIn(next: string) {
  window.location.replace(clientSignInPath(next));
}
