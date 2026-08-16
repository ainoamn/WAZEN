"use client";

import { ReactNode } from "react";
import { CommerceLocaleProvider } from "./commercial-kit";

export default function AppProviders({ children }: { children: ReactNode }) {
  return <CommerceLocaleProvider>{children}</CommerceLocaleProvider>;
}
