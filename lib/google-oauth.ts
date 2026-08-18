import { ApiError } from "./api-error";
import { appOrigin } from "./app-origin";
import { createSessionToken } from "./auth";
import { validateOutboundHttpsUrl } from "./outbound";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_MAX_MS = 10 * 60 * 1000;

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

type SignedState = {
  n: string;
  v: string;
  next: string;
  iat: number;
  bid: string;
  ru: string;
};

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured() {
  const { clientId, clientSecret } = googleCredentials();
  return Boolean(clientId && clientSecret && oauthHmacSecret());
}

function oauthHmacSecret() {
  return process.env.WAZEN_JOB_SECRET?.trim()
    || process.env.WAZEN_OAUTH_STATE_SECRET?.trim()
    || process.env.WAZEN_ENCRYPTION_KEYRING?.trim()
    || process.env.GOOGLE_CLIENT_SECRET?.trim()
    || "";
}

export function googleCallbackUrl(request: Request) {
  return `${appOrigin(request)}/api/auth/google/callback`;
}

export function safeAuthNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

async function hmacSign(payload: string) {
  const secret = oauthHmacSecret();
  if (!secret) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return bytesToBase64Url(signature);
}

export async function createGoogleOAuthRequest(request: Request, nextPath: string, browserId = "") {
  const { clientId } = googleCredentials();
  if (!isGoogleOAuthConfigured()) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  const verifier = createSessionToken();
  const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const redirectUri = googleCallbackUrl(request);
  const state: SignedState = {
    n: createSessionToken(),
    v: verifier,
    next: safeAuthNext(nextPath),
    iat: Date.now(),
    bid: browserId.slice(0, 128),
    ru: redirectUri,
  };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signed = `${payload}.${await hmacSign(payload)}`;
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", signed);
  url.searchParams.set("code_challenge", bytesToBase64Url(challengeBytes));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), signedState: signed, nonce: state.n, redirectUri };
}

export async function readGoogleOAuthState(signed: string) {
  const dot = signed.lastIndexOf(".");
  if (dot < 8) throw new ApiError(400, "GOOGLE_AUTH_FAILED");
  const payload = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  if (await hmacSign(payload) !== signature) throw new ApiError(400, "GOOGLE_AUTH_FAILED");
  let parsed: SignedState;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as SignedState;
  } catch {
    throw new ApiError(400, "GOOGLE_AUTH_FAILED");
  }
  if (!parsed?.n || !parsed?.v || Date.now() - Number(parsed.iat) > STATE_MAX_MS) throw new ApiError(400, "GOOGLE_AUTH_FAILED");
  return { ...parsed, next: safeAuthNext(parsed.next), bid: String(parsed.bid ?? ""), ru: String(parsed.ru ?? "") };
}

export function oauthCsrfOk(cookieNonce: string | null, parsed: { n: string; bid: string }, browserId: string | null) {
  if (cookieNonce && cookieNonce === parsed.n) return true;
  return Boolean(parsed.bid && browserId && parsed.bid === browserId);
}

export function googleStartPage(url: string) {
  const safe = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "");
  return `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}"><title>Google</title></head><body><p><a href="${safe}">Continue</a></p><script>location.replace(${JSON.stringify(url)})</script></body></html>`;
}

export function mapGoogleCallbackError(error: string | null) {
  if (!error) return null;
  if (error === "access_denied") return "GOOGLE_ACCESS_DENIED";
  return "GOOGLE_AUTH_FAILED";
}

export function oauthStateCookie(value: string, maxAge = 600) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wazen_oauth=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearOAuthStateCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wazen_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function resolveTokenRedirectUri(request: Request, stored: string) {
  const expected = googleCallbackUrl(request);
  if (stored === expected) return stored;
  try {
    const url = new URL(stored);
    const requestOrigin = new URL(request.url).origin;
    if (url.pathname === "/api/auth/google/callback" && (url.origin === appOrigin(request) || url.origin === requestOrigin)) {
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    /* use expected */
  }
  return expected;
}

function tokenErrorCode(body: string) {
  const lowered = body.toLowerCase();
  if (lowered.includes("invalid_client") || lowered.includes("unauthorized_client")) return "GOOGLE_CLIENT_INVALID";
  if (lowered.includes("redirect_uri_mismatch")) return "GOOGLE_REDIRECT_MISMATCH";
  return "GOOGLE_TOKEN_FAILED";
}

export async function exchangeGoogleCode(request: Request, code: string, verifier: string, storedRedirectUri = ""): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleCredentials();
  if (!clientId || !clientSecret) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  const tokenUrl = validateOutboundHttpsUrl(GOOGLE_TOKEN, ["oauth2.googleapis.com"]);
  const redirectUri = resolveTokenRedirectUri(request, storedRedirectUri);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    const detail = (await tokenResponse.text().catch(() => "")).slice(0, 400);
    console.error(JSON.stringify({ level: "error", code: "GOOGLE_TOKEN_FAILED", status: tokenResponse.status, detail, at: new Date().toISOString() }));
    throw new ApiError(401, tokenErrorCode(detail));
  }
  const tokens = await tokenResponse.json() as { access_token?: string; id_token?: string };
  if (!tokens.access_token) throw new ApiError(401, "GOOGLE_TOKEN_FAILED");
  const userInfoUrl = validateOutboundHttpsUrl(GOOGLE_USERINFO, ["openidconnect.googleapis.com"]);
  const profileResponse = await fetch(userInfoUrl, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  const email = String(profile.email ?? "").trim().toLowerCase();
  if (!profile.sub || !email) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  return {
    sub: profile.sub,
    email,
    emailVerified: profile.email_verified === true,
    name: String(profile.name ?? email.split("@")[0] ?? "User").trim().slice(0, 80) || "User",
    picture: profile.picture ? String(profile.picture).slice(0, 500) : null,
  };
}
