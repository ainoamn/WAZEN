import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Safe admin landing. Matches ONE-BHD admin-entry — never local password login. */
function adminReturnTo(request: Request): string {
  const raw = new URL(request.url).searchParams.get("next")?.trim() || "/admin";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) {
    return "/admin";
  }
  return raw;
}

/**
 * Product + identity: never send admins to a local password login form.
 * Forwards to BHD start so the same identity session opens `/admin`.
 * Admin role stays in Wazen's `platform_roles` for this `bhd_sub` only (guide §0.7).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const returnTo = adminReturnTo(request);
  return NextResponse.redirect(
    new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin),
  );
}
