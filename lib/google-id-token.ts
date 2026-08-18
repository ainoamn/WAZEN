import { ApiError } from "./api-error";
import { googleClientId, type GoogleProfile } from "./google-oauth";
import { validateOutboundHttpsUrl } from "./outbound";

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

type Jwk = { kid?: string; kty?: string; n?: string; e?: string; alg?: string };
type JwtHeader = { kid?: string; alg?: string };
type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
  sub?: string;
  name?: string;
  picture?: string;
};

let jwkCache: { keys: Jwk[]; expiresAt: number } | null = null;

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
}

function audienceMatches(aud: string | string[] | undefined, clientId: string) {
  if (!clientId) return false;
  if (typeof aud === "string") return aud === clientId;
  return Array.isArray(aud) && aud.includes(clientId);
}

function toProfile(payload: JwtPayload): GoogleProfile {
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!payload.sub || !email) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const verified = payload.email_verified === true || payload.email_verified === "true";
  return {
    sub: payload.sub,
    email,
    emailVerified: verified,
    name: String(payload.name ?? email.split("@")[0] ?? "User").trim().slice(0, 80) || "User",
    picture: payload.picture ? String(payload.picture).slice(0, 500) : null,
  };
}

async function googleJwks() {
  if (jwkCache && jwkCache.expiresAt > Date.now()) return jwkCache.keys;
  const url = validateOutboundHttpsUrl(GOOGLE_CERTS, ["www.googleapis.com"]);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const body = await response.json() as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  jwkCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

async function verifySignedJwt(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const header = decodeJson<JwtHeader>(parts[0]);
  if (header.alg !== "RS256" || !header.kid) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const keys = await googleJwks();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk?.n || !jwk.e) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, base64UrlToBytes(parts[2]), data);
  if (!ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  return decodeJson<JwtPayload>(parts[1]);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientId = googleClientId();
  if (!clientId) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  if (!idToken || idToken.length < 32 || idToken.length > 4096) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  let payload: JwtPayload;
  try {
    payload = await verifySignedJwt(idToken);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  }
  if (!ISSUERS.has(String(payload.iss ?? "")) || !audienceMatches(payload.aud, clientId)) {
    throw new ApiError(401, "GOOGLE_CLIENT_INVALID");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60_000) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  return toProfile(payload);
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleProfile> {
  const clientId = googleClientId();
  if (!clientId) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
  if (!accessToken || accessToken.length < 16 || accessToken.length > 4096) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const infoUrl = validateOutboundHttpsUrl(`${GOOGLE_TOKENINFO}?access_token=${encodeURIComponent(accessToken)}`, ["oauth2.googleapis.com"]);
  const infoResponse = await fetch(infoUrl, { cache: "no-store" });
  if (!infoResponse.ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const info = await infoResponse.json() as { aud?: string; azp?: string };
  if (info.aud !== clientId && info.azp !== clientId) throw new ApiError(401, "GOOGLE_CLIENT_INVALID");
  const userInfoUrl = validateOutboundHttpsUrl(GOOGLE_USERINFO, ["openidconnect.googleapis.com"]);
  const profileResponse = await fetch(userInfoUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!profileResponse.ok) throw new ApiError(401, "GOOGLE_AUTH_FAILED");
  const profile = await profileResponse.json() as JwtPayload;
  return toProfile(profile);
}
