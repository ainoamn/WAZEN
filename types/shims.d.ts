/** Ambient shims so Next/Vercel typecheck works without Cloudflare runtime packages. */

declare module "cloudflare:workers" {
  // Minimal shape used by db/index.ts; real bindings come from the Workers runtime.
  export const env: {
    DB?: D1Database;
    [key: string]: unknown;
  };
}

// Cloudflare runtime types used by optional worker/db code paths.
interface D1Database {
  prepare(query: string): unknown;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: unknown[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
