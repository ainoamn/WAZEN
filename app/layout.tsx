import type { Metadata } from "next";
import "./globals.css";
import "./saas.css";
import "./public.css";
import "./admin-extra.css";

export const metadata: Metadata = {
  title: "رِفد | RIFD",
  description: "منصة ذكية لإدارة الأموال الشخصية والمشتركة والجمعيات والرحلات",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
