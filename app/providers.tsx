"use client";

import { ReactNode, useEffect } from "react";
import { SessionKeepAlive } from "../components/auth/SessionKeepAlive";
import { CommerceLocaleProvider } from "./commercial-kit";
import { BrowserSessionSync } from "./browser-session-sync";
import { LiveBuildGuard } from "../lib/live-sync";
import SessionIdleGuard from "./session-idle-guard";
import { registerWazenServiceWorker } from "../components/pwa/PwaInstallCard";

function PwaBootstrap() {
  useEffect(() => {
    registerWazenServiceWorker();
  }, []);
  return null;
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <BrowserSessionSync />
      <SessionKeepAlive />
      <SessionIdleGuard />
      <LiveBuildGuard />
      <PwaBootstrap />
      {children}
    </CommerceLocaleProvider>
  );
}
