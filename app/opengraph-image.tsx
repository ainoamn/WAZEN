import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "وازن — أموالك الشخصية والمشتركة، متوازنة بوضوح";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const png = await readFile(join(process.cwd(), "public/brand/wazen-mark.png"));
  const logo = `data:image/png;base64,${png.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #F6F9FC 0%, #ECFDF5 55%, #E2E8F0 100%)",
          color: "#0F172A",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={96} height={96} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>WAZEN</div>
            <div style={{ fontSize: 28, color: "#10B981", fontWeight: 700 }}>وازن</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
          <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.25, color: "#0F172A" }}>
            Personal and shared money, clearly balanced
          </div>
          <div style={{ fontSize: 26, color: "#64748B", lineHeight: 1.45 }}>
            Households, circles, trips, and wallets in one trusted platform
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
