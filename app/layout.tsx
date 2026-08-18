import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import NavigationProgress from "../components/brand/NavigationProgress";
import AppProviders from "./providers";
import "./globals.css";
import "./commercial.css";

/** Arabic UI: IBM Plex Sans Arabic. Latin/EN: Inter. */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateMetadata(): Metadata {
  const configured = process.env.WAZEN_APP_ORIGIN ?? "https://wazen.bhd-om.com";
  let origin = "https://wazen.bhd-om.com";
  try {
    origin = new URL(configured.split(/[\s,;]+/)[0] ?? configured).origin;
  } catch {
    origin = "https://wazen.bhd-om.com";
  }
  return {
    metadataBase: new URL(origin),
    title: {
      default: "وازن | إدارة أموالك بوضوح",
      template: "%s | وازن",
    },
    description:
      "منصة مالية عربية وعالمية لإدارة المحافظ الشخصية والمنزلية والجمعيات والرحلات.",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/favicon.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/wazen-app-icon.png", type: "image/png", sizes: "1024x1024" },
      ],
      apple: [{ url: "/brand/favicon-180.png", type: "image/png", sizes: "180x180" }],
      shortcut: ["/favicon.ico"],
    },
    openGraph: {
      title: "وازن | كل أموالك في صورة واضحة",
      description:
        "أدر دخلك ومصاريفك ومحافظ العائلة والجمعيات والرحلات دون أن تختلط الحسابات.",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "وازن | كل أموالك في صورة واضحة",
      description: "منصة مالية شخصية وجماعية، مصممة للعربية والعالم.",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${inter.variable}`}>
      <body className={plexArabic.className}>
        <AppProviders>
          <NavigationProgress />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
