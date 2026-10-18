"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type InstantLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
  };

/**
 * Internal nav link with prefetch on (BHD unified apps §0.3).
 * Prefer this over bare <a> / delayed Link for in-app routes.
 */
export default function InstantLink({ prefetch = true, children, ...props }: InstantLinkProps) {
  return (
    <Link prefetch={prefetch} {...props}>
      {children}
    </Link>
  );
}
