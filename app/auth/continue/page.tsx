import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Return path after identity /login?add=1 from a product.
 * Binds the new active account via silent SSO to the original URL.
 */
export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const params = await searchParams;
  let returnTo = "/dashboard";
  const raw = String(params.to || "").trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.origin.includes("bhd-om.com") || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        returnTo = `${url.pathname}${url.search}` || "/dashboard";
      }
    } catch {
      if (raw.startsWith("/") && !raw.startsWith("//")) returnTo = raw;
    }
  }
  redirect(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`);
}
