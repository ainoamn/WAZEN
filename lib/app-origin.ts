import { ApiError } from "./api-error";

function firstPublicOrigin(raw: string) {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/\\r|\\n/g, " ")
    .trim();
  const candidates = cleaned.split(/[\s,;]+/).filter(Boolean);
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      /* try next token */
    }
  }
  return null;
}

/** Sanitize and resolve the public app origin from env or the current request. */
export function appOrigin(request?: Request) {
  const configured = process.env.WAZEN_APP_ORIGIN ?? "";
  const fromEnv = firstPublicOrigin(configured);
  if (fromEnv) return fromEnv;
  if (configured.trim()) throw new ApiError(500, "APP_ORIGIN_INVALID");
  if (request) return new URL(request.url).origin;
  throw new ApiError(500, "APP_ORIGIN_INVALID");
}
