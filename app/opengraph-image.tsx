import { ImageResponse } from "next/og";

export const alt = "WAZEN — personal and shared money, clearly balanced";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function WazenSymbolOg() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
      <path d="M8 18 C8 14 12 12 16 12 H29 C33 12 36 14 38 18 L58 57 L47 76 C44 82 37 86 30 86 C23 86 17 82 14 76 L2 28 C1 23 3 19 8 18 Z" fill="#173B63" />
      <path d="M34 28 C41 21 50 18 59 20 C65 21 70 25 74 30 L59 58 L48 44 C44 38 39 33 34 28 Z" fill="#153B64" />
      <path d="M112 18 C112 14 108 12 104 12 H91 C87 12 84 14 82 18 L62 57 L73 76 C76 82 83 86 90 86 C97 86 103 82 106 76 L118 28 C119 23 117 19 112 18 Z" fill="#0F9F91" />
      <path d="M86 28 C79 21 70 18 61 20 C55 21 50 25 46 30 L61 58 L72 44 C76 38 81 33 86 28 Z" fill="#10B981" opacity="0.92" />
      <path d="M60 35 C55 42 52 50 52 59 C52 65 55 70 60 74 C65 70 68 65 68 59 C68 50 65 42 60 35 Z" fill="#F8FAFC" />
      <circle cx="60" cy="22" r="7" fill="#0F9F91" />
    </svg>
  );
}

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
          background: "linear-gradient(135deg, #F8FAFC 0%, #ECFDF5 55%, #E2E8F0 100%)",
          color: "#0F172A",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <WazenSymbolOg />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: 6 }}>WAZEN</div>
            <div style={{ fontSize: 28, color: "#0F9F91", fontWeight: 700 }}>وازن</div>
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
