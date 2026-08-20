import { writeAudit } from "./audit";
import { ensureDefaultTenant } from "./authorization";
import type { BhdIdClaims } from "./bhd-identity";
import { ApiError } from "./api-error.ts";
import { ensureBootstrapPlatformRole } from "./platform-role-bootstrap";

export async function upsertBhdUser(db: D1Database, claims: BhdIdClaims) {
  const email = claims.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const bySub = await db.prepare(`SELECT u.id,u.email,u.display_name,p.status
    FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id
    WHERE u.bhd_sub=? LIMIT 1`)
    .bind(claims.sub).first<{ id: string; email: string; display_name: string; status: string | null }>();
  if (bySub) {
    if (bySub.status === "suspended" || bySub.status === "closed") throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
    await db.prepare("UPDATE users SET email=?,display_name=?,avatar_url=COALESCE(?,avatar_url) WHERE id=?")
      .bind(email, claims.name, claims.picture, bySub.id).run();
    await db.prepare("UPDATE customer_profiles SET last_seen_at=? WHERE user_id=?").bind(now, bySub.id).run();
    await db.prepare("UPDATE auth_credentials SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE user_id=?")
      .bind(now, now, bySub.id).run();
    await ensureBootstrapPlatformRole(db, bySub.id, email, now);
    return { id: bySub.id, email, displayName: claims.name, created: false };
  }

  const existing = await db.prepare(`SELECT u.id,u.email,u.display_name,u.bhd_sub,p.status,c.email_verified_at
    FROM users u
    LEFT JOIN customer_profiles p ON p.user_id=u.id
    LEFT JOIN auth_credentials c ON c.user_id=u.id
    WHERE u.email=? COLLATE NOCASE LIMIT 1`)
    .bind(email).first<{ id: string; email: string; display_name: string; bhd_sub: string | null; status: string | null; email_verified_at: string | null }>();

  if (existing) {
    if (existing.status === "suspended" || existing.status === "closed") throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
    const googleLink = await db.prepare("SELECT id FROM oauth_identities WHERE user_id=? AND provider='google' LIMIT 1")
      .bind(existing.id).first<{ id: string }>();
    // Identity already required email_verified; that is the email proof for linking.
    const verified = Boolean(existing.email_verified_at || googleLink || claims.emailVerified);
    if (!verified) throw new ApiError(409, "BHD_EMAIL_IN_USE");
    if (existing.bhd_sub && existing.bhd_sub !== claims.sub) throw new ApiError(409, "BHD_ACCOUNT_MISMATCH");
    await db.prepare("UPDATE users SET bhd_sub=?,display_name=?,avatar_url=COALESCE(?,avatar_url) WHERE id=?")
      .bind(claims.sub, claims.name, claims.picture, existing.id).run();
    await db.prepare("UPDATE customer_profiles SET last_seen_at=? WHERE user_id=?").bind(now, existing.id).run();
    await db.prepare("UPDATE auth_credentials SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE user_id=?")
      .bind(now, now, existing.id).run();
    // Preserve existing platform_roles; promote only when WAZEN_ADMIN_EMAILS matches (§0.7).
    await ensureBootstrapPlatformRole(db, existing.id, email, now);
    await writeAudit(db, { userId: existing.id, action: "auth.bhd_linked", entityType: "user", entityId: existing.id, createdAt: now });
    return { id: existing.id, email: existing.email, displayName: claims.name, created: false };
  }

  const userId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,locale,currency,avatar_url,bhd_sub,created_at) VALUES (?,?,?,'ar','OMR',?,?,?)")
      .bind(userId, email, claims.name, claims.picture, claims.sub, now),
    db.prepare("INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','OM',?,?)").bind(userId, now, now),
  ]);
  await ensureBootstrapPlatformRole(db, userId, email, now);
  await ensureDefaultTenant(db, { id: userId, displayName: claims.name });
  await writeAudit(db, { userId, action: "auth.bhd_registered", entityType: "user", entityId: userId, createdAt: now });
  return { id: userId, email, displayName: claims.name, created: true };
}
