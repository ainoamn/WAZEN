"use client";

import { useId, type CSSProperties } from "react";
import WazenLogo from "./WazenLogo";

type WazenPageLoaderProps = {
  /** 0–100; when omitted, the heart loops a fill animation */
  progress?: number;
  label?: string;
  /** Full-viewport overlay (route transitions) vs inline page placeholder */
  overlay?: boolean;
  compact?: boolean;
};

/**
 * Brand loading state: official lockup + heart that fills to show progress.
 */
export default function WazenPageLoader({
  progress,
  label = "جاري التحميل…",
  overlay = false,
  compact = false,
}: WazenPageLoaderProps) {
  const clamped =
    typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : undefined;

  return (
    <div
      className={`wazen-page-loader${overlay ? " is-overlay" : ""}${compact ? " is-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="wazen-page-loader-inner">
        <WazenLogo
          showText
          iconClassName={compact ? "h-12 w-auto" : "h-[4.5rem] w-auto max-w-[min(280px,72vw)]"}
        />
        <HeartFill progress={clamped} />
        <span className="wazen-page-loader-label">{label}</span>
      </div>
    </div>
  );
}

function HeartFill({ progress }: { progress?: number }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `wazen-heart-clip-${uid}`;
  const gradId = `wazen-heart-grad-${uid}`;
  const animated = progress === undefined;
  const fill = animated ? undefined : progress;

  return (
    <div
      className={`wazen-heart${animated ? " is-animated" : ""}`}
      style={fill !== undefined ? ({ "--heart-fill": `${fill}%` } as CSSProperties) : undefined}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="wazen-heart-svg">
        <defs>
          <clipPath id={clipId}>
            <path d="M32 56.5C32 56.5 8 41.2 8 24.8 8 16.2 14.6 10 22.8 10c5.1 0 9.6 2.7 12.2 6.8C37.6 12.7 42.1 10 47.2 10 55.4 10 62 16.2 62 24.8 62 41.2 38 56.5 32 56.5Z" />
          </clipPath>
          <linearGradient id={gradId} x1="12" y1="56" x2="52" y2="10" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0B5F52" />
            <stop offset="1" stopColor="#14B8A6" />
          </linearGradient>
        </defs>
        <path
          className="wazen-heart-outline"
          d="M32 56.5C32 56.5 8 41.2 8 24.8 8 16.2 14.6 10 22.8 10c5.1 0 9.6 2.7 12.2 6.8C37.6 12.7 42.1 10 47.2 10 55.4 10 62 16.2 62 24.8 62 41.2 38 56.5 32 56.5Z"
          fill="none"
          stroke="#1E3A5F"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${clipId})`}>
          <rect className="wazen-heart-fill" x="0" y="0" width="64" height="64" fill={`url(#${gradId})`} />
        </g>
      </svg>
    </div>
  );
}
