"use client";

import { ReactNode } from "react";
import { CommerceLocaleProvider } from "./commercial-kit";
import SessionIdleGuard from "./session-idle-guard";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <SessionIdleGuard />
      {children}
    </CommerceLocaleProvider>
  );
}
