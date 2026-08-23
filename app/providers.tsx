"use client";

import { ReactNode } from "react";
import { SessionKeepAlive } from "../components/auth/SessionKeepAlive";
import { CommerceLocaleProvider } from "./commercial-kit";
import { BrowserSessionSync } from "./browser-session-sync";
import { LiveBuildGuard } from "../lib/live-sync";
import SessionIdleGuard from "./session-idle-guard";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <BrowserSessionSync />
      <SessionKeepAlive />
      <SessionIdleGuard />
      <LiveBuildGuard />
      {children}
    </CommerceLocaleProvider>
  );
}
