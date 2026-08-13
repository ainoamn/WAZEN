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

/** Official Omani Rial (ر.ع.) currency mark. */
export default function OmrSymbol({
  variant = "medium",
  className = "h-4 w-auto",
  title = "ر.ع.",
}: {
  variant?: OmrSymbolVariant;
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt={title}
      title={title}
      className={`omr-symbol inline-block align-middle ${className}`}
      width={64}
      height={64}
    />
  );
}

/** Amount with the official Omani Rial mark. */
export function OmrAmount({
  children,
  className = "",
  symbolClassName = "h-[0.95em] w-auto",
  variant = "medium",
}: {
  children: ReactNode;
  className?: string;
  symbolClassName?: string;
  variant?: OmrSymbolVariant;
}) {
  return (
    <span className={`omr-amount inline-flex items-center gap-[0.28em] ${className}`}>
      <OmrSymbol variant={variant} className={symbolClassName} />
      <span>{children}</span>
    </span>
  );
}
