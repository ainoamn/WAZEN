"use client";

import type { ReactNode } from "react";

export type OmrSymbolVariant =
  | "bold"
  | "medium"
  | "light"
  | "bold-white"
  | "medium-white"
  | "light-white";

const SRC: Record<OmrSymbolVariant, string> = {
  bold: "/brand/currency/omr-bold.png",
  medium: "/brand/currency/omr-medium.png",
  light: "/brand/currency/omr-light.png",
  "bold-white": "/brand/currency/omr-bold-white.png",
  "medium-white": "/brand/currency/omr-medium-white.png",
  "light-white": "/brand/currency/omr-light-white.png",
};

/**
 * Official Omani Rial mark — always capped to a small glyph size.
 * (Global `img { max-width:100% }` must not enlarge it.)
 */
export default function OmrSymbol({
  variant = "medium",
  size = 14,
  className = "",
  title = "ر.ع.",
}: {
  variant?: OmrSymbolVariant;
  /** Pixel height of the glyph (width scales with aspect). */
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt={title}
      title={title}
      className={`omr-symbol ${className}`}
      width={size}
      height={size}
      style={{
        width: "auto",
        height: `${size}px`,
        maxWidth: `${Math.round(size * 1.35)}px`,
        maxHeight: `${size}px`,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

/** Compact amount label using ر.ع. text (safe for dense UI). */
export function OmrAmount({
  children,
  className = "",
  showMark = false,
  markSize = 12,
}: {
  children: ReactNode;
  className?: string;
  /** When true, shows the official PNG mark at a tiny fixed size. */
  showMark?: boolean;
  markSize?: number;
}) {
  return (
    <span className={`omr-amount ${className}`}>
      {showMark ? <OmrSymbol size={markSize} /> : null}
      <span>{children}</span>
      <span className="omr-code" aria-hidden="true">ر.ع.</span>
    </span>
  );
}
