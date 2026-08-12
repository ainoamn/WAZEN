import { ImageResponse } from "next/og";

export const alt = "WAZEN — clarity for every wallet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
          background: "linear-gradient(135deg, #123C36 0%, #0A7A64 100%)",
          color: "#E8F5F1",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            W
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>WAZEN</div>
            <div style={{ fontSize: 28, opacity: 0.88 }}>وازن</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
          <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.25 }}>
            Clarity for every wallet
          </div>
          <div style={{ fontSize: 28, opacity: 0.9, lineHeight: 1.45 }}>
            Personal, family, circle, and trip finance in one place
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
