import { ApiError } from "./api-error";

/** Sanitize and resolve the public app origin from env or the current request. */
export function appOrigin(request?: Request) {
  const configured = process.env.WAZEN_APP_ORIGIN
    ?.replace(/^\uFEFF/, "")
    .replace(/\\r|\\n/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new ApiError(500, "APP_ORIGIN_INVALID");
    }
  }

  if (request) return new URL(request.url).origin;
  throw new ApiError(500, "APP_ORIGIN_INVALID");
}
