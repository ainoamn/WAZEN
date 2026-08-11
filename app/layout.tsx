import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./commercial.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:5173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = `${origin}/og-commercial.png`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "وازن | إدارة أموالك بوضوح",
      template: "%s | وازن",
    },
    description:
      "منصة مالية عربية وعالمية لإدارة المحافظ الشخصية والمنزلية والجمعيات والرحلات.",
    openGraph: {
      title: "وازن | كل أموالك في صورة واضحة",
      description:
        "أدر دخلك ومصاريفك ومحافظ العائلة والجمعيات والرحلات دون أن تختلط الحسابات.",
      type: "website",
      images: [{ url: socialImage, width: 1732, height: 909, alt: "وازن — أموالك بوضوح" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "وازن | كل أموالك في صورة واضحة",
      description: "منصة مالية شخصية وجماعية، مصممة للعربية والعالم.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
