import { ApiError } from "./api-error.ts";
import { appOrigin } from "./app-origin.ts";
import { validateOutboundHttpsUrl } from "./outbound.ts";

export const BHD_IDENTITY_SPEC = "bhd-identity.v1";
export const BHD_OAUTH_CLIENT_ID = "bhd-wazen";
export const DEFAULT_BHD_IDENTITY_ISSUER = "https://id.bhd-om.com";
/** Browser-reachable identity host while id.bhd-om.com times out from some Oman networks. */
export const BHD_IDENTITY_VERCEL_ORIGIN = "https://one-bhd.vercel.app";
export const BHD_OAUTH_STATE_COOKIE = "bhd_oauth_state";
const JWKS_CACHE_MS = 10 * 60 * 1000;

export type BhdOauthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

export type BhdIdClaims = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
  preferredUsername: string | null;
  phoneNumber: string | null;
};

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string | null;
  preferred_username?: string | null;
  phone_number?: string | null;
};
type Jwk = { kid?: string; kty?: string; n?: string; e?: string; alg?: string; k?: string };

let jwkCache: { keys: Jwk[]; expiresAt: number; uri: string } | null = null;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
}

function randomOauthToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return rest.join("="); }
    }
  }
  return null;
}

function secureAttribute() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function identityIssuer() {
  const configured = process.env.BHD_IDENTITY_ISSUER?.trim();
  return (configured || DEFAULT_BHD_IDENTITY_ISSUER).replace(/\/$/, "");
}

/** Host used for authorize/token/jwks. Prefer the Vercel identity origin so Oman can reach it. */
export function identityEndpointBase() {
  const endpoint = process.env.BHD_IDENTITY_ENDPOINT?.trim();
  if (endpoint) return endpoint.replace(/\/$/, "");
  const configured = process.env.BHD_IDENTITY_ISSUER?.trim().replace(/\/$/, "") || "";
  if (!configured || configured === DEFAULT_BHD_IDENTITY_ISSUER) return BHD_IDENTITY_VERCEL_ORIGIN;
  return configured;
}

/** Identity returns 400 for unknown redirect_uri; 307/302 when the client is allowed. */
export function identityAuthorizeProbeAllows(status: number) {
  return status === 200 || (status >= 300 && status < 400);
}

export async function identityAcceptsAuthorizeUrl(authorizeUrl: string) {
  try {
    const url = validateOutboundHttpsUrl(authorizeUrl, identityAllowedHosts());
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    return identityAuthorizeProbeAllows(response.status);
  } catch {
    return false;
  }
}

export function bhdClientId() {
  return process.env.BHD_OAUTH_CLIENT_ID?.trim() || BHD_OAUTH_CLIENT_ID;
}

export function bhdClientSecret() {
  return process.env.BHD_OAUTH_CLIENT_SECRET?.trim() ?? "";
}

export function isBhdIdentityConfigured() {
  if (process.env.BHD_OAUTH_DISABLED === "1") return false;
  return Boolean(identityIssuer() && bhdClientId());
}

export function identityAllowedHosts() {
  const hosts = new Set(["id.bhd-om.com", "one-bhd.vercel.app"]);
  try {
    hosts.add(new URL(identityIssuer()).hostname.toLowerCase());
  } catch {
    /* ignore invalid issuer */
  }
  try {
    hosts.add(new URL(identityEndpointBase()).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  return [...hosts];
}

function issuerAllowed(iss: string | undefined) {
  if (!iss) return false;
  const allowed = new Set([identityIssuer(), DEFAULT_BHD_IDENTITY_ISSUER, BHD_IDENTITY_VERCEL_ORIGIN]);
  try { allowed.add(identityEndpointBase()); } catch { /* ignore */ }
  return allowed.has(iss);
}

export function safeReturnTo(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

const KNOWN_ORIGINS = new Set([
  "https://wazen.bhd-om.com",
  "https://wazen-roan.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);

/** Origins where ONE-BHD has registered the OAuth callback for bhd-wazen. */
const BHD_SSO_READY_ORIGINS = new Set([
  "https://wazen.bhd-om.com",
  "http://localhost:3000",
  "http://localhost:3001",
]);

export function isBhdSsoReadyForOrigin(origin: string) {
  if (!isBhdIdentityConfigured()) return false;
  if (process.env.BHD_SSO_READY === "1") return true;
  if (process.env.BHD_SSO_READY === "0") return false;
  return BHD_SSO_READY_ORIGINS.has(origin.replace(/\/$/, ""));
}

export function isBhdSsoReadyForRequest(request: Request) {
  try {
    return isBhdSsoReadyForOrigin(publicRequestOrigin(request));
  } catch {
    return false;
  }
}

/**
 * SSO-ready origins (wazen.bhd-om.com) go straight to BHD start.
 * Other origins (Vercel preview, localhost without SSO) show the local form.
 */
export function signInEntryPathForOrigin(next: string, origin: string) {
  const safeNext = safeReturnTo(next);
  if (isBhdSsoReadyForOrigin(origin)) {
    return `/api/auth/bhd/start?next=${encodeURIComponent(safeNext)}`;
  }
  return `/login?local=1&next=${encodeURIComponent(safeNext)}`;
}

export function signInEntryPath(next: string, request: Request) {
  try {
    return signInEntryPathForOrigin(next, publicRequestOrigin(request));
  } catch {
    return `/login?local=1&next=${encodeURIComponent(safeReturnTo(next))}`;
  }
}

export function publicRequestOrigin(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (KNOWN_ORIGINS.has(origin)) return origin;
  } catch {
    /* fall through */
  }
  return appOrigin(request);
}

export function bhdRedirectUri(request: Request) {
  const origin = publicRequestOrigin(request);
  const configured = process.env.BHD_OAUTH_REDIRECT_URI?.trim();
  if (configured) {
    try {
      if (new URL(configured).origin === origin) return configured;
    } catch {
      /* ignore invalid configured URI */
    }
  }
  return `${origin}/api/auth/bhd/callback`;
}

export function bhdEndSessionUrl(request: Request) {
  const issuer = identityEndpointBase();
  const url = new URL(`${issuer}/oauth/end-session`);
  url.searchParams.set("post_logout_redirect_uri", `${publicRequestOrigin(request)}/`);
  url.searchParams.set("client_id", bhdClientId());
  return url.toString();
}

export async function pkceChallenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return bytesToBase64Url(digest);
}

export function bhdOauthStateCookie(value: string, maxAge = 300) {
  return `${BHD_OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttribute()}`;
}

export function clearBhdOauthStateCookie() {
  return `${BHD_OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute()}`;
}

export function encodeBhdOauthState(state: BhdOauthState) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

export function decodeBhdOauthState(raw: string | null): BhdOauthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw))) as BhdOauthState;
    if (!parsed?.state || !parsed?.nonce || !parsed?.verifier) return null;
    return {
      state: String(parsed.state),
      nonce: String(parsed.nonce),
      verifier: String(parsed.verifier),
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

export function readBhdOauthStateCookie(request: Request) {
  return decodeBhdOauthState(cookieValue(request, BHD_OAUTH_STATE_COOKIE));
}

export async function createBhdAuthRequest(request: Request, returnTo: string) {
  if (!isBhdIdentityConfigured()) throw new ApiError(503, "BHD_NOT_CONFIGURED");
  const state = randomOauthToken();
  const nonce = randomOauthToken();
  const verifier = randomOauthToken();
  if (verifier.length < 43) throw new ApiError(500, "BHD_PKCE_FAILED");
  const challenge = await pkceChallenge(verifier);
  const payload: BhdOauthState = { state, nonce, verifier, returnTo: safeReturnTo(returnTo) };
  const issuer = identityEndpointBase();
  const url = new URL(`${issuer}/oauth/authorize`);
  url.searchParams.set("client_id", bhdClientId());
  url.searchParams.set("redirect_uri", bhdRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), cookie: encodeBhdOauthState(payload) };
}

function audienceMatches(aud: string | string[] | undefined, clientId: string) {
  if (!clientId) return false;
  if (typeof aud === "string") return aud === clientId;
  return Array.isArray(aud) && aud.includes(clientId);
}

function claimsFromPayload(payload: JwtPayload): BhdIdClaims {
  const email = String(payload.email ?? "").trim().toLowerCase();
  const sub = String(payload.sub ?? "").trim();
  if (!sub || !email) throw new ApiError(401, "BHD_TOKEN_INVALID");
  const verified = payload.email_verified === true || payload.email_verified === "true";
  return {
    sub,
    email,
    emailVerified: verified,
    name: String(payload.name ?? email.split("@")[0] ?? "User").trim().slice(0, 80) || "User",
    picture: payload.picture ? String(payload.picture).slice(0, 500) : null,
    preferredUsername: payload.preferred_username ? String(payload.preferred_username).slice(0, 80) : null,
    phoneNumber: payload.phone_number ? String(payload.phone_number).slice(0, 32) : null,
  };
}

async function identityJwks() {
  const uri = `${identityEndpointBase()}/oauth/jwks.json`;
  if (jwkCache && jwkCache.uri === uri && jwkCache.expiresAt > Date.now()) return jwkCache.keys;
  const url = validateOutboundHttpsUrl(uri, identityAllowedHosts());
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new ApiError(401, "BHD_TOKEN_INVALID");
  const body = await response.json() as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwkCache = { keys, uri, expiresAt: Date.now() + JWKS_CACHE_MS };
  return keys;
}

async function verifyRs256(idToken: string, header: JwtHeader) {
  const parts = idToken.split(".");
  const keys = await identityJwks();
  const jwk = keys.find((key) => key.kty === "RSA" && (!header.kid || key.kid === header.kid));
  if (!jwk?.n || !jwk.e) throw new ApiError(401, "BHD_TOKEN_INVALID");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new ApiError(401, "BHD_TOKEN_INVALID");
}

export async function verifyHs256Jwt(idToken: string, secret: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts[0]}.${parts[1]}`)));
  const expected = bytesToBase64Url(signature);
  const actual = parts[2];
  if (expected.length !== actual.length) return false;
  let result = 0;
  for (let index = 0; index < expected.length; index += 1) result |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return result === 0;
}

async function fetchUserinfo(accessToken: string) {
  const url = validateOutboundHttpsUrl(`${identityEndpointBase()}/oauth/userinfo`, identityAllowedHosts());
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new ApiError(401, "BHD_TOKEN_INVALID");
  return await response.json() as { sub?: string; email?: string; email_verified?: boolean };
}

export async function verifyBhdIdToken(idToken: string, nonce: string, accessToken?: string): Promise<BhdIdClaims> {
  if (!idToken || idToken.length < 32 || idToken.length > 8192) throw new ApiError(401, "BHD_TOKEN_INVALID");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ApiError(401, "BHD_TOKEN_INVALID");
  const header = decodeJson<JwtHeader>(parts[0]);
  const payload = decodeJson<JwtPayload>(parts[1]);
  const alg = header.alg;
  let signed = false;
  if (alg === "RS256") {
    await verifyRs256(idToken, header);
    signed = true;
  } else if (alg === "HS256") {
    const secret = process.env.BHD_IDENTITY_TOKEN_SECRET?.trim() || "";
    if (secret) {
      if (!await verifyHs256Jwt(idToken, secret)) throw new ApiError(401, "BHD_TOKEN_INVALID");
      signed = true;
    }
  } else {
    throw new ApiError(401, "BHD_TOKEN_INVALID");
  }
  if (!signed) {
    if (!accessToken) throw new ApiError(401, "BHD_TOKEN_INVALID");
    const info = await fetchUserinfo(accessToken);
    if (info.sub !== payload.sub || String(info.email ?? "").trim().toLowerCase() !== String(payload.email ?? "").trim().toLowerCase()) {
      throw new ApiError(401, "BHD_TOKEN_INVALID");
    }
  }
  if (!issuerAllowed(payload.iss)) throw new ApiError(401, "BHD_TOKEN_INVALID");
  if (!audienceMatches(payload.aud, bhdClientId())) throw new ApiError(401, "BHD_TOKEN_INVALID");
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60_000) throw new ApiError(401, "BHD_TOKEN_INVALID");
  if (!payload.nonce || payload.nonce !== nonce) throw new ApiError(401, "BHD_NONCE_MISMATCH");
  const claims = claimsFromPayload(payload);
  if (!claims.emailVerified) throw new ApiError(403, "BHD_EMAIL_UNVERIFIED");
  return claims;
}

export async function exchangeBhdCode(request: Request, code: string, verifier: string, nonce: string): Promise<BhdIdClaims> {
  if (!isBhdIdentityConfigured()) throw new ApiError(503, "BHD_NOT_CONFIGURED");
  if (!code || !verifier) throw new ApiError(401, "BHD_AUTH_FAILED");
  const tokenUrl = validateOutboundHttpsUrl(`${identityEndpointBase()}/oauth/token`, identityAllowedHosts());
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: bhdRedirectUri(request),
    client_id: bhdClientId(),
    code_verifier: verifier,
  });
  const secret = bhdClientSecret();
  if (secret) body.set("client_secret", secret);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    console.error(JSON.stringify({ level: "error", code: "BHD_TOKEN_FAILED", status: response.status, detail, at: new Date().toISOString() }));
    throw new ApiError(401, "BHD_TOKEN_FAILED");
  }
  const tokens = await response.json() as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new ApiError(401, "BHD_TOKEN_FAILED");
  return verifyBhdIdToken(tokens.id_token, nonce, tokens.access_token);
}

export function mapBhdCallbackError(error: string | null) {
  if (!error) return null;
  if (error === "access_denied") return "BHD_ACCESS_DENIED";
  if (error === "invalid_request" || error === "unauthorized_client" || error === "invalid_scope") return "BHD_AUTH_FAILED";
  return "BHD_AUTH_FAILED";
}
