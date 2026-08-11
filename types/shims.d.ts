/**
 * Ambient stubs so Next.js/Vercel can typecheck without the Cloudflare
 * Workers runtime modules that vinext uses on Sites.
 */
declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    [key: string]: unknown;
  };
}
