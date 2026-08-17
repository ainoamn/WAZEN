"use client";

import { ReactNode } from "react";
import { CommerceLocaleProvider } from "./commercial-kit";
import { LiveBuildGuard } from "../lib/live-sync";
import SessionIdleGuard from "./session-idle-guard";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <SessionIdleGuard />
      <LiveBuildGuard />
      {children}
    </CommerceLocaleProvider>
  );
}
