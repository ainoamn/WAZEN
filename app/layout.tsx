import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./commercial.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-cairo",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:5173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
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
        { url: "/brand/wazen-app-icon.png", type: "image/png" },
        { url: "/favicon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/brand/wazen-app-icon.png", type: "image/png" }],
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
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className={cairo.className}>{children}</body>
    </html>
  );
}
