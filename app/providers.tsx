"use client";

import { ReactNode, useEffect } from "react";
import { SessionKeepAlive } from "../components/auth/SessionKeepAlive";
import { PwaInstallBanner, registerWazenServiceWorker } from "../components/pwa/PwaInstallCard";
import { CommerceLocaleProvider, useCommerceLocale } from "./commercial-kit";
import { BrowserSessionSync } from "./browser-session-sync";
import { LiveBuildGuard } from "../lib/live-sync";
import SessionIdleGuard from "./session-idle-guard";

function PwaBootstrap() {
  useEffect(() => {
    registerWazenServiceWorker();
  }, []);
  return null;
}

function SitePwaPrompt() {
  const { locale } = useCommerceLocale();
  return <PwaInstallBanner locale={locale} />;
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <BrowserSessionSync />
      <SessionKeepAlive />
      <SessionIdleGuard />
      <LiveBuildGuard />
      <PwaBootstrap />
      <SitePwaPrompt />
      {children}
    </CommerceLocaleProvider>
  );
}
