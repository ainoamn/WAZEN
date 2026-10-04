"use client";

import { ReactNode, useEffect } from "react";
import { PwaInstallBanner, registerWazenServiceWorker } from "../components/pwa/PwaInstallCard";
import { OfflineSyncBar } from "../components/pwa/OfflineSyncBar";
import { CommerceLocaleProvider, useCommerceLocale } from "./commercial-kit";
import { BrowserSessionSync } from "./browser-session-sync";
import { LiveBuildGuard } from "../lib/live-sync";
function PwaBootstrap() {
  useEffect(() => {
    registerWazenServiceWorker();
  }, []);
  return null;
}

function SitePwaPrompt() {
  const { locale } = useCommerceLocale();
  return (
    <>
      <OfflineSyncBar locale={locale} />
      <PwaInstallBanner locale={locale} />
    </>
  );
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CommerceLocaleProvider>
      <BrowserSessionSync />
      <LiveBuildGuard />
      <PwaBootstrap />
      <SitePwaPrompt />
      {children}
    </CommerceLocaleProvider>
  );
}
