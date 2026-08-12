"use client";

export type WazenLogoProps = {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  showArabic?: boolean;
  variant?: "light" | "dark";
};

/** Official Wazen mark — sourced from ChatGPT brand board (PNG, not approximate SVG). */
export default function WazenLogo({
  className = "",
  iconClassName = "h-10 w-auto",
  showText = true,
  showArabic = false,
  variant = "light",
}: WazenLogoProps) {
  const textClass = variant === "dark" ? "wazen-logo-wordmark wazen-logo-wordmark-dark" : "wazen-logo-wordmark";

  return (
    <div className={`wazen-logo inline-flex items-center gap-3 ${className}`} aria-label="WAZEN">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/wazen-mark.png"
        alt=""
        className={`wazen-logo-icon shrink-0 ${iconClassName}`}
        width={120}
        height={55}
      />
      {showText && (
        <div className="wazen-logo-copy flex flex-col justify-center leading-none">
          <span className={textClass}>WAZEN</span>
          {showArabic && (
            <span className="wazen-logo-arabic mt-1 text-sm font-semibold" dir="rtl">
              وازن
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function WazenIcon({
  className = "h-9 w-auto",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  return (
    <WazenLogo
      showText={false}
      className=""
      iconClassName={className}
    />
  );
}
