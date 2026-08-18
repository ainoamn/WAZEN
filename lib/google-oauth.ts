import { ApiError } from "./api-error";
import { createSessionToken } from "./auth";
import { validateOutboundHttpsUrl } from "./outbound";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_MAX_MS = 10 * 60 * 1000;
/** Public OAuth client ID for wazen.bhd-om.com. Secret stays in Vercel only. */
const PRODUCTION_GOOGLE_CLIENT_ID = "162957418455-43a02mk5li1adbju9m9niuf02b57ht90.apps.googleusercontent.com";

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
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || PRODUCTION_GOOGLE_CLIENT_ID;
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
  return `${new URL(request.url).origin}/api/auth/google/callback`;
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

export async function createGoogleOAuthRequest(request: Request, nextPath: string) {
  const { clientId } = googleCredentials();
  if (!isGoogleOAuthConfigured()) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  const verifier = createSessionToken();
  const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state: SignedState = { n: createSessionToken(), v: verifier, next: safeAuthNext(nextPath), iat: Date.now() };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signed = `${payload}.${await hmacSign(payload)}`;
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCallbackUrl(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", signed);
  url.searchParams.set("code_challenge", bytesToBase64Url(challengeBytes));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), signedState: signed };
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
  return { ...parsed, next: safeAuthNext(parsed.next) };
}

export function oauthStateCookie(value: string, maxAge = 600) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wazen_oauth=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearOAuthStateCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wazen_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function exchangeGoogleCode(request: Request, code: string, verifier: string): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleCredentials();
  if (!clientId || !clientSecret) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  const tokenUrl = validateOutboundHttpsUrl(GOOGLE_TOKEN, ["oauth2.googleapis.com"]);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleCallbackUrl(request),
    code_verifier: verifier,
  });
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const tokens = await tokenResponse.json() as { access_token?: string; id_token?: string };
  if (!tokens.access_token) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
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
