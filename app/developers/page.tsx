import type { Metadata } from "next";
import DevelopersClient from "./developers-client";

export const metadata: Metadata = {
  title: "واجهة برمجة وازن | WAZEN API",
  robots: { index: false, follow: false },
};

export default function DevelopersPage() {
  return <DevelopersClient />;
}
