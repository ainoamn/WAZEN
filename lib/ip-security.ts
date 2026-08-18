import { sha256 } from "./auth";

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "unknown";
}

export function clientCountry(request: Request) {
  const country = request.headers.get("x-vercel-ip-country")
    ?? request.headers.get("cf-ipcountry")
    ?? request.headers.get("x-country-code");
  const code = String(country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function maskIp(ip: string) {
  if (!ip || ip === "unknown") return "unknown";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.length > 2 ? `${parts.slice(0, 3).join(":")}:…` : `${ip.slice(0, Math.max(4, ip.length - 8))}…`;
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.***`;
  return `${ip.slice(0, Math.max(4, ip.length - 4))}***`;
}

export async function ipHash(ip: string) {
  return sha256(`ip:${ip}`);
}

export type SecurityEventInput = {
  ip: string;
  userId?: string | null;
  eventType: string;
  countryCode?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordSecurityEvent(db: D1Database, input: SecurityEventInput) {
  const now = new Date().toISOString();
  const hash = await ipHash(input.ip);
  const masked = maskIp(input.ip);
  await db.prepare(`INSERT INTO security_events (id,ip_hash,ip_masked,user_id,event_type,country_code,user_agent,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(),
    hash,
    masked,
    input.userId ?? null,
    input.eventType,
    input.countryCode ?? null,
    input.userAgent ? String(input.userAgent).slice(0, 512) : null,
    JSON.stringify(input.metadata ?? {}),
    now,
  ).run();
}

export async function isIpBlocked(db: D1Database, ip: string) {
  if (!ip || ip === "unknown") return false;
  const hash = await ipHash(ip);
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT ip_hash FROM blocked_ips
    WHERE ip_hash=? AND status='blocked' AND (expires_at IS NULL OR expires_at>?) LIMIT 1`)
    .bind(hash, now).first();
  return Boolean(row);
}

export async function blockIpByHash(
  db: D1Database,
  input: { ipHash: string; ipMasked: string; reason: string; blockedBy: string; expiresInHours?: number | null },
) {
  const now = new Date().toISOString();
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString()
    : null;
  await db.prepare(`INSERT INTO blocked_ips (ip_hash,ip_masked,reason,status,blocked_by,blocked_at,expires_at)
    VALUES (?,?,?,'blocked',?,?,?)
    ON CONFLICT(ip_hash) DO UPDATE SET
      ip_masked=excluded.ip_masked,
      reason=excluded.reason,
      status='blocked',
      blocked_by=excluded.blocked_by,
      blocked_at=excluded.blocked_at,
      expires_at=excluded.expires_at`).bind(
    input.ipHash,
    input.ipMasked,
    input.reason.slice(0, 300),
    input.blockedBy,
    now,
    expiresAt,
  ).run();
  return { ipHash: input.ipHash, ipMasked: input.ipMasked, expiresAt };
}

export async function unblockIpByHash(db: D1Database, ipHashValue: string, actorUserId: string) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE blocked_ips SET status='allowed', blocked_by=?, blocked_at=? WHERE ip_hash=?`)
    .bind(actorUserId, now, ipHashValue).run();
  return { ipHash: ipHashValue };
}

export async function trustIpByHash(db: D1Database, ipHashValue: string, ipMasked: string, actorUserId: string) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO blocked_ips (ip_hash,ip_masked,reason,status,blocked_by,blocked_at,expires_at)
    VALUES (?,?,?,'allowed',?,?,NULL)
    ON CONFLICT(ip_hash) DO UPDATE SET status='allowed', reason=excluded.reason, blocked_by=excluded.blocked_by, blocked_at=excluded.blocked_at`)
    .bind(ipHashValue, ipMasked, "admin_trusted", actorUserId, now).run();
  return { ipHash: ipHashValue, ipMasked };
}

export async function blockIp(
  db: D1Database,
  input: { ip: string; reason: string; blockedBy: string; expiresInHours?: number | null },
) {
  const now = new Date().toISOString();
  const hash = await ipHash(input.ip);
  const masked = maskIp(input.ip);
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString()
    : null;
  await db.prepare(`INSERT INTO blocked_ips (ip_hash,ip_masked,reason,status,blocked_by,blocked_at,expires_at)
    VALUES (?,?,?,'blocked',?,?,?)
    ON CONFLICT(ip_hash) DO UPDATE SET
      ip_masked=excluded.ip_masked,
      reason=excluded.reason,
      status='blocked',
      blocked_by=excluded.blocked_by,
      blocked_at=excluded.blocked_at,
      expires_at=excluded.expires_at`).bind(
    hash,
    masked,
    input.reason.slice(0, 300),
    input.blockedBy,
    now,
    expiresAt,
  ).run();
  return { ipHash: hash, ipMasked: masked, expiresAt };
}

export async function unblockIp(db: D1Database, ip: string, actorUserId: string) {
  const hash = await ipHash(ip);
  const now = new Date().toISOString();
  await db.prepare(`UPDATE blocked_ips SET status='allowed', blocked_by=?, blocked_at=? WHERE ip_hash=?`)
    .bind(actorUserId, now, hash).run();
  return { ipHash: hash };
}

export async function trustIp(db: D1Database, ip: string, actorUserId: string) {
  const hash = await ipHash(ip);
  const masked = maskIp(ip);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO blocked_ips (ip_hash,ip_masked,reason,status,blocked_by,blocked_at,expires_at)
    VALUES (?,?,?,'allowed',?,?,NULL)
    ON CONFLICT(ip_hash) DO UPDATE SET status='allowed', reason=excluded.reason, blocked_by=excluded.blocked_by, blocked_at=excluded.blocked_at`)
    .bind(hash, masked, "admin_trusted", actorUserId, now).run();
  return { ipHash: hash, ipMasked: masked };
}

export async function maybeAutoBlockIp(
  db: D1Database,
  ip: string,
  scope: string,
  hits: number,
  limit: number,
) {
  if (ip === "unknown" || hits <= limit) return false;
  const excess = hits - limit;
  const windowStart = new Date(Date.now() - 900_000).toISOString();
  const recent = await db.prepare(`SELECT COUNT(*) AS count FROM security_events
    WHERE ip_hash=? AND event_type='rate_limit_exceeded' AND created_at>=?`)
    .bind(await ipHash(ip), windowStart).first<{ count: number }>();
  const strikes = Number(recent?.count ?? 0) + 1;
  await recordSecurityEvent(db, {
    ip,
    eventType: "rate_limit_exceeded",
    metadata: { scope, hits, limit, strikes },
  });
  if (strikes >= 3 || hits > limit * 3) {
    await blockIp(db, {
      ip,
      reason: `auto:${scope}:strikes=${strikes}`,
      blockedBy: "system",
      expiresInHours: strikes >= 5 ? 24 * 7 : 24,
    });
    return true;
  }
  return false;
}

export type IpAccessRow = {
  ip_hash: string;
  ip_masked: string;
  country_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  hit_count: number;
  blocked: boolean;
  user_agent: string | null;
};

export async function listUserIpAccess(db: D1Database, userId: string): Promise<IpAccessRow[]> {
  const now = new Date().toISOString();
  const [sessions, events, blocks] = await Promise.all([
    db.prepare(`SELECT ip_hash, ip_masked, country_code, user_agent, created_at, last_seen_at
      FROM auth_sessions WHERE user_id=? AND ip_hash IS NOT NULL ORDER BY last_seen_at DESC LIMIT 200`)
      .bind(userId).all<{ ip_hash: string; ip_masked: string; country_code: string | null; user_agent: string | null; created_at: string; last_seen_at: string }>(),
    db.prepare(`SELECT ip_hash, ip_masked, country_code, user_agent, created_at
      FROM security_events WHERE user_id=? ORDER BY created_at DESC LIMIT 200`)
      .bind(userId).all<{ ip_hash: string; ip_masked: string; country_code: string | null; user_agent: string | null; created_at: string }>(),
    db.prepare(`SELECT ip_hash, status FROM blocked_ips WHERE status='blocked' AND (expires_at IS NULL OR expires_at>?)`)
      .bind(now).all<{ ip_hash: string; status: string }>(),
  ]);
  const blockedSet = new Set(blocks.results.map((row) => row.ip_hash));
  const merged = new Map<string, IpAccessRow>();

  for (const row of [...sessions.results, ...events.results]) {
    if (!row.ip_hash) continue;
    const existing = merged.get(row.ip_hash);
    const seenAt = String((row as { last_seen_at?: string }).last_seen_at ?? row.created_at);
    const createdAt = row.created_at;
    if (!existing) {
      merged.set(row.ip_hash, {
        ip_hash: row.ip_hash,
        ip_masked: row.ip_masked,
        country_code: row.country_code,
        first_seen_at: createdAt,
        last_seen_at: seenAt,
        hit_count: 1,
        blocked: blockedSet.has(row.ip_hash),
        user_agent: row.user_agent,
      });
    } else {
      existing.hit_count += 1;
      if (createdAt < existing.first_seen_at) existing.first_seen_at = createdAt;
      if (seenAt > existing.last_seen_at) {
        existing.last_seen_at = seenAt;
        if (row.user_agent) existing.user_agent = row.user_agent;
        if (row.country_code) existing.country_code = row.country_code;
      }
      existing.blocked = existing.blocked || blockedSet.has(row.ip_hash);
    }
  }

  return [...merged.values()].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
}
