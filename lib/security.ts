import { sha256, verifyCsrfToken } from "./auth";
import { ApiError } from "./api-error";
import { appOrigin } from "./app-origin";
import { clientIp, isIpBlocked, maybeAutoBlockIp } from "./ip-security";
export { ApiError };

export function enforceWriteRequest(request: Request, maxBytes = 65_536) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE");
  const origin = request.headers.get("origin");
  const expected = appOrigin(request);
  if (origin && origin !== expected && origin !== new URL(request.url).origin) throw new ApiError(403, "ORIGIN_REJECTED");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "ORIGIN_REJECTED");
}

export async function rateLimit(db: D1Database, request: Request, scope: string, limit: number, windowSeconds: number) {
  const address = clientIp(request);
  try {
    if (await isIpBlocked(db, address)) throw new ApiError(403, "IP_BLOCKED");
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
  const key = await sha256(`${scope}:${address}`);
  const now = new Date();
  const nowIso = now.toISOString(); const expiresAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
  const row = await db.prepare(`INSERT INTO rate_limits (key,hits,window_started_at,expires_at) VALUES (?,1,?,?)
    ON CONFLICT(key) DO UPDATE SET
      hits=CASE WHEN rate_limits.expires_at<=excluded.window_started_at THEN 1 ELSE rate_limits.hits+1 END,
      window_started_at=CASE WHEN rate_limits.expires_at<=excluded.window_started_at THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
      expires_at=CASE WHEN rate_limits.expires_at<=excluded.window_started_at THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING hits`).bind(key, nowIso, expiresAt).first<{ hits: number }>();
  const hits = Number(row?.hits ?? 1);
  if (hits > limit) {
    try { await maybeAutoBlockIp(db, address, scope, hits, limit); } catch { /* still rate-limit even if auto-block ledger fails */ }
    throw new ApiError(429, "RATE_LIMITED");
  }
}

export async function claimIdempotency(db: D1Database, userId: string, action: string, key: string) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED");
  const existing = await db.prepare("SELECT action,response_json FROM idempotency_keys WHERE key=? AND user_id=?")
    .bind(key, userId).first<{ action: string; response_json: string | null; created_at?: string }>();
  if (existing) {
    if (existing.action !== action) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED");
    if (existing.response_json) return JSON.parse(existing.response_json);
    throw new ApiError(409, "REQUEST_IN_PROGRESS");
  }
  const now = new Date();
  try {
    await db.prepare("INSERT INTO idempotency_keys (key,user_id,action,response_json,created_at,expires_at) VALUES (?,?,?,?,?,?)")
      .bind(key, userId, action, null, now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString()).run();
  } catch {
    const raced = await db.prepare("SELECT action,response_json FROM idempotency_keys WHERE key=? AND user_id=?").bind(key, userId).first<{ action: string; response_json: string | null }>();
    if (raced && raced.action !== action) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED");
    if (raced?.response_json) return JSON.parse(raced.response_json);
    throw new ApiError(409, "REQUEST_IN_PROGRESS");
  }
  return null;
}

export async function enforceCsrf(db: D1Database, request: Request) {
  if (!(await verifyCsrfToken(db, request))) throw new ApiError(403, "CSRF_REJECTED");
}

export async function completeIdempotency(db: D1Database, userId: string, key: string, response: unknown) {
  await db.prepare("UPDATE idempotency_keys SET response_json=? WHERE key=? AND user_id=?")
    .bind(JSON.stringify(response), key, userId).run();
}

export async function releaseIdempotency(db: D1Database, userId: string, key: string) {
  await db.prepare("DELETE FROM idempotency_keys WHERE key=? AND user_id=? AND response_json IS NULL")
    .bind(key, userId).run();
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.code }, { status: error.status });
  const message = error instanceof Error ? error.message : String(error);
  const code = message === "DATABASE_NOT_CONFIGURED" ? "DATABASE_NOT_CONFIGURED" : "INTERNAL_ERROR";
  console.error(JSON.stringify({
    level: "error",
    code,
    message,
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8) : undefined,
    at: new Date().toISOString(),
  }));
  const diagnostic = process.env.NODE_ENV !== "production" ? { detail: message } : {};
  return Response.json({ error: code, ...diagnostic }, { status: code === "DATABASE_NOT_CONFIGURED" ? 503 : 500 });
}
