import { getRequestUser, type RequestUser } from "../db/runtime";
import { browserCsrfCookie, browserSessionCookie, csrfCookieName, idleCutoffIso, isSessionIdle, SESSION_MAX_MS, sessionCookieName } from "./session-policy";
import { clientCountry, clientIp, ipHash, maskIp } from "./ip-security";

const SESSION_COOKIE = sessionCookieName();
const CSRF_COOKIE = csrfCookieName();
const PASSWORD_ITERATIONS = 600_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PASSWORD_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number) {
  const actual = await hashPassword(password, base64ToBytes(salt), iterations);
  return constantTimeEqual(actual.hash, expectedHash);
}

export function createSessionToken() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function sessionCookie(token: string, _expiresAt?: Date) {
  return browserSessionCookie(token);
}

export function csrfCookie(token: string, _expiresAt?: Date) {
  return browserCsrfCookie(token);
}

export function sessionHeaders(session: { token: string; csrfToken: string; expiresAt: Date }) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", sessionCookie(session.token));
  headers.append("Set-Cookie", csrfCookie(session.csrfToken));
  return headers;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function clearCsrfCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CSRF_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function createSession(db: D1Database, userId: string, request?: Request) {
  const token = createSessionToken();
  const csrfToken = createSessionToken(); const tokenHash = await sha256(token); const csrfTokenHash = await sha256(csrfToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_MS);
  const ip = request ? clientIp(request) : null;
  const hash = ip ? await ipHash(ip) : null;
  const masked = ip ? maskIp(ip) : null;
  const country = request ? clientCountry(request) : null;
  const userAgent = request?.headers.get("user-agent")?.slice(0, 512) ?? null;
  await db.prepare(`INSERT INTO auth_sessions (id,user_id,token_hash,csrf_token_hash,ip_hash,ip_masked,user_agent,country_code,expires_at,created_at,last_seen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), userId, tokenHash, csrfTokenHash, hash, masked, userAgent, country, expiresAt.toISOString(), now.toISOString(), now.toISOString()).run();
  return { token, csrfToken, expiresAt };
}

export async function revokeSession(db: D1Database, request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await sha256(token)).run();
}

export async function authenticateRequest(db: D1Database, request: Request): Promise<RequestUser | null> {
  const hosted = getRequestUser(request);
  if (hosted) return hosted;
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer wzn_")) {
    const raw = authorization.slice(7); const now = new Date().toISOString();
    const apiKey = await db.prepare(`SELECT k.id,k.scopes_json,u.id AS user_id,u.email,u.display_name,u.avatar_url,p.status FROM api_keys k
      JOIN users u ON u.id=k.user_id LEFT JOIN customer_profiles p ON p.user_id=u.id
      WHERE k.token_hash=? AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>?) LIMIT 1`).bind(await sha256(raw), now)
      .first<{ id: string; scopes_json: string; user_id: string; email: string; display_name: string; avatar_url: string | null; status: string | null }>();
    if (!apiKey || apiKey.status === "suspended" || apiKey.status === "closed") return null;
    await db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").bind(now, apiKey.id).run();
    let scopes: string[] = []; try { scopes = JSON.parse(apiKey.scopes_json) as string[]; } catch { scopes = []; }
    return { id: apiKey.user_id, email: apiKey.email, displayName: apiKey.display_name, avatarUrl: apiKey.avatar_url, isDemo: false, authType: "api_key", scopes };
  }
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await db.prepare(`SELECT u.id,u.email,u.display_name,u.avatar_url,p.status,s.id AS session_id,s.last_seen_at
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN customer_profiles p ON p.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`)
    .bind(await sha256(token), new Date().toISOString())
    .first<{ id: string; email: string; display_name: string; avatar_url: string | null; status: string | null; session_id: string; last_seen_at: string }>();
  if (!row || row.status === "suspended" || row.status === "closed") return null;
  if (isSessionIdle(row.last_seen_at)) {
    await db.prepare("DELETE FROM auth_sessions WHERE id=?").bind(row.session_id).run();
    return null;
  }
  await db.prepare("UPDATE auth_sessions SET last_seen_at=? WHERE id=?").bind(new Date().toISOString(), row.session_id).run();
  return { id: row.id, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url, isDemo: false, authType: "session" };
}

export async function issueCsrfToken(db: D1Database, request: Request) {
  const sessionToken = cookieValue(request, SESSION_COOKIE); if (!sessionToken) return null;
  const now = new Date().toISOString(); const sessionHash = await sha256(sessionToken);
  const row = await db.prepare("SELECT csrf_token_hash,expires_at FROM auth_sessions WHERE token_hash=? AND expires_at>? AND last_seen_at>?").bind(sessionHash, now, idleCutoffIso()).first<{ csrf_token_hash: string | null; expires_at: string }>();
  if (!row) return null;
  const existingToken = cookieValue(request, CSRF_COOKIE);
  if (existingToken && row.csrf_token_hash && constantTimeEqual(await sha256(existingToken), row.csrf_token_hash)) return { csrfToken: existingToken, expiresAt: new Date(row.expires_at) };
  const csrfToken = createSessionToken(); const nextHash = await sha256(csrfToken);
  const result = await db.prepare("UPDATE auth_sessions SET csrf_token_hash=? WHERE token_hash=? AND csrf_token_hash IS NOT DISTINCT FROM ? AND expires_at>?")
    .bind(nextHash, sessionHash, row.csrf_token_hash, now).run();
  return Number(result.meta.changes) > 0 ? { csrfToken, expiresAt: new Date(row.expires_at) } : null;
}

export async function verifyCsrfToken(db: D1Database, request: Request) {
  const authorization = request.headers.get("authorization") ?? ""; if (authorization.startsWith("Bearer wzn_")) return true;
  const sessionToken = cookieValue(request, SESSION_COOKIE); const cookieToken = cookieValue(request, CSRF_COOKIE); const headerToken = request.headers.get("x-csrf-token");
  if (!sessionToken || !cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) return false;
  const row = await db.prepare("SELECT id FROM auth_sessions WHERE token_hash=? AND csrf_token_hash=? AND expires_at>? AND last_seen_at>? LIMIT 1")
    .bind(await sha256(sessionToken), await sha256(cookieToken), new Date().toISOString(), idleCutoffIso()).first();
  return Boolean(row);
}

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
