import { ApiError } from "./api-error.ts";

const privateIpv4 = /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|224\.|240\.)/;

export function validateOutboundHttpsUrl(raw: string, allowedHosts: string[]) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError(400, "INVALID_PROVIDER_URL"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || privateIpv4.test(hostname)) {
    throw new ApiError(400, "INVALID_PROVIDER_URL");
  }
  const normalized = allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length || !normalized.some((host) => hostname === host)) throw new ApiError(400, "PROVIDER_HOST_NOT_ALLOWED");
  url.hash = "";
  return url;
}

/** User-configured integration webhooks: HTTPS + no private hosts (no allowlist). */
export function validatePublicHttpsWebhookUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError(400, "INVALID_WEBHOOK_URL"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "[::1]"
    || privateIpv4.test(hostname)
  ) {
    throw new ApiError(400, "INVALID_WEBHOOK_URL");
  }
  url.hash = "";
  return url;
}

export function configuredAllowedHosts(name: "email" | "payment") {
  const key = name === "email" ? "WAZEN_EMAIL_PROVIDER_HOSTS" : "WAZEN_PAYMENT_PROVIDER_HOSTS";
  return (process.env[key] ?? "").split(",");
}
