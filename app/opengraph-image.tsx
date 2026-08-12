import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "WAZEN — clarity for every wallet";
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
          background: "linear-gradient(135deg, #F4FAF8 0%, #E8F5F1 55%, #D4EDE4 100%)",
          color: "#123C36",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={96} height={96} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>WAZEN</div>
            <div style={{ fontSize: 28, color: "#0A7A64", fontWeight: 700 }}>Personal and shared finance</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.2, color: "#123C36" }}>
            Clarity for every wallet
          </div>
          <div style={{ fontSize: 28, color: "#4A635C", lineHeight: 1.45 }}>
            Households, circles, trips, and business spaces in one calm platform
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
