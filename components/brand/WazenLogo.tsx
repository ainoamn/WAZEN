"use client";

import { useId } from "react";

export type WazenLogoProps = {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  showArabic?: boolean;
  variant?: "light" | "dark";
};

function WazenSymbol({ className, uid }: { className?: string; uid: string }) {
  return (
    <svg
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
      role="img"
      aria-hidden={true}
    >
      <defs>
        <linearGradient id={`${uid}-navy`} x1="8" y1="10" x2="62" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173B63" />
          <stop offset="1" stopColor="#08213D" />
        </linearGradient>
        <linearGradient id={`${uid}-teal`} x1="112" y1="10" x2="58" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#23B6A5" />
          <stop offset="1" stopColor="#0F9F91" />
        </linearGradient>
      </defs>
      <path
        d="M8 18 C8 14 12 12 16 12 H29 C33 12 36 14 38 18 L58 57 L47 76 C44 82 37 86 30 86 C23 86 17 82 14 76 L2 28 C1 23 3 19 8 18 Z"
        fill={`url(#${uid}-navy)`}
      />
      <path
        d="M34 28 C41 21 50 18 59 20 C65 21 70 25 74 30 L59 58 L48 44 C44 38 39 33 34 28 Z"
        fill="#153B64"
      />
      <path
        d="M112 18 C112 14 108 12 104 12 H91 C87 12 84 14 82 18 L62 57 L73 76 C76 82 83 86 90 86 C97 86 103 82 106 76 L118 28 C119 23 117 19 112 18 Z"
        fill={`url(#${uid}-teal)`}
      />
      <path
        d="M86 28 C79 21 70 18 61 20 C55 21 50 25 46 30 L61 58 L72 44 C76 38 81 33 86 28 Z"
        fill="#10B981"
        opacity="0.92"
      />
      <path
        d="M60 35 C55 42 52 50 52 59 C52 65 55 70 60 74 C65 70 68 65 68 59 C68 50 65 42 60 35 Z"
        fill="#F8FAFC"
      />
      <circle cx="60" cy="22" r="7" fill="#0F9F91" />
    </svg>
  );
}

export default function WazenLogo({
  className = "",
  iconClassName = "h-10 w-12",
  showText = true,
  showArabic = false,
  variant = "light",
}: WazenLogoProps) {
  const uid = useId().replace(/:/g, "");
  const textClass = variant === "dark" ? "wazen-logo-wordmark wazen-logo-wordmark-dark" : "wazen-logo-wordmark";

  return (
    <div className={`wazen-logo inline-flex items-center gap-3 ${className}`} aria-label="WAZEN">
      <WazenSymbol className={`wazen-logo-icon shrink-0 ${iconClassName}`} uid={uid} />
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
  className = "h-9 w-[2.7rem]",
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  return (
    <WazenLogo
      showText={false}
      className=""
      iconClassName={className}
      variant={variant}
    />
  );
}

export { WazenSymbol };
