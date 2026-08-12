"use client";

export type WazenLogoProps = {
  className?: string;
  iconClassName?: string;
  /** When true, shows the full lockup (mark + WAZEN + وازن). When false, mark only. */
  showText?: boolean;
  showArabic?: boolean;
  variant?: "light" | "dark";
};

/**
 * Official Wazen logo.
 * - Full site logo: `/brand/wazen-lockup.png`
 * - Icon-only: `/brand/wazen-mark.png`
 */
export default function WazenLogo({
  className = "",
  iconClassName = "h-10 w-auto",
  showText = true,
}: WazenLogoProps) {
  const src = showText ? "/brand/wazen-lockup.png" : "/brand/wazen-mark.png";
  const alt = showText ? "WAZEN · وازن" : "WAZEN";

  return (
    <div className={`wazen-logo inline-flex items-center ${className}`} aria-label="WAZEN">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`wazen-logo-icon shrink-0 ${iconClassName} ${showText ? "wazen-logo-lockup" : "wazen-logo-mark"}`}
        width={showText ? 420 : 120}
        height={showText ? 96 : 55}
      />
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
