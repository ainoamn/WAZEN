import { ImageResponse } from "next/og";

export const alt = "WAZEN — clarity for every wallet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function BalanceMark() {
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: "22px 22px 22px 8px",
        background: "linear-gradient(145deg, #123C36, #0A7A64)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        boxShadow: "0 12px 32px rgba(10, 122, 100, 0.35)",
      }}
    >
      <div style={{ position: "relative", width: 52, height: 44, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 3, height: 14, background: "#FFFFFF", borderRadius: 2 }} />
        <div style={{ width: 52, height: 3, background: "#FFFFFF", borderRadius: 2, marginTop: 2 }} />
        <div style={{ width: 8, height: 8, borderRadius: 999, background: "#B8F0DE", marginTop: -6 }} />
        <div style={{ display: "flex", justifyContent: "space-between", width: 52, marginTop: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 2, height: 10, background: "#FFFFFF", borderRadius: 2 }} />
            <div style={{ width: 22, height: 22, borderRadius: 999, border: "3px solid #FFFFFF" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 2, height: 10, background: "#FFFFFF", borderRadius: 2 }} />
            <div style={{ width: 22, height: 22, borderRadius: 999, border: "3px solid #FFFFFF" }} />
          </div>
        </div>
      </div>
    </div>
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
          background: "linear-gradient(135deg, #F4FAF8 0%, #E8F5F1 55%, #D4EDE4 100%)",
          color: "#123C36",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <BalanceMark />
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
