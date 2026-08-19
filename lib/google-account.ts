import { createSessionToken, hashPassword, normalizeEmail } from "./auth";
import { ensureDefaultTenant } from "./authorization";
import { writeAudit } from "./audit";
import type { GoogleProfile } from "./google-oauth";
import { ApiError } from "./api-error";
import { ensureBootstrapPlatformRole } from "./platform-role-bootstrap";

export async function upsertGoogleUser(db: D1Database, profile: GoogleProfile) {
  if (!profile.emailVerified) throw new ApiError(403, "GOOGLE_EMAIL_UNVERIFIED");
  const email = normalizeEmail(profile.email);
  const now = new Date().toISOString();
  const identity = await db.prepare("SELECT user_id FROM oauth_identities WHERE provider='google' AND provider_user_id=? LIMIT 1")
    .bind(profile.sub).first<{ user_id: string }>();
  if (identity) {
    const account = await db.prepare(`SELECT u.id,u.email,u.display_name,p.status FROM users u
      LEFT JOIN customer_profiles p ON p.user_id=u.id WHERE u.id=? LIMIT 1`)
      .bind(identity.user_id).first<{ id: string; email: string; display_name: string; status: string | null }>();
    if (!account || account.status === "suspended" || account.status === "closed") throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
    if (profile.picture) await db.prepare("UPDATE users SET avatar_url=? WHERE id=?").bind(profile.picture, account.id).run();
    await db.prepare("UPDATE auth_credentials SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE user_id=?")
      .bind(now, now, account.id).run();
    return { id: account.id, email: account.email, displayName: account.display_name, created: false };
  }

  const existing = await db.prepare(`SELECT u.id,u.email,u.display_name,p.status FROM users u
    LEFT JOIN customer_profiles p ON p.user_id=u.id WHERE u.email=? COLLATE NOCASE LIMIT 1`)
    .bind(email).first<{ id: string; email: string; display_name: string; status: string | null }>();
  if (existing) {
    if (existing.status === "suspended" || existing.status === "closed") throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
    await db.prepare("INSERT INTO oauth_identities (id,user_id,provider,provider_user_id,email,created_at) VALUES (?,?, 'google',?,?,?)")
      .bind(crypto.randomUUID(), existing.id, profile.sub, email, now).run();
    await db.prepare("UPDATE auth_credentials SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE user_id=?")
      .bind(now, now, existing.id).run();
    if (profile.picture) await db.prepare("UPDATE users SET avatar_url=? WHERE id=?").bind(profile.picture, existing.id).run();
    await writeAudit(db, { userId: existing.id, action: "auth.google_linked", entityType: "user", entityId: existing.id, createdAt: now });
    return { id: existing.id, email: existing.email, displayName: existing.display_name, created: false };
  }

  const userId = crypto.randomUUID();
  const passwordData = await hashPassword(createSessionToken() + createSessionToken());
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,locale,currency,avatar_url,created_at) VALUES (?,?,?,'ar','OMR',?,?)")
      .bind(userId, email, profile.name, profile.picture, now),
    db.prepare("INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','OM',?,?)").bind(userId, now, now),
    db.prepare("INSERT INTO auth_credentials (user_id,password_hash,password_salt,password_iterations,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(userId, passwordData.hash, passwordData.salt, passwordData.iterations, now, now, now),
    db.prepare("INSERT INTO oauth_identities (id,user_id,provider,provider_user_id,email,created_at) VALUES (?,?, 'google',?,?,?)")
      .bind(crypto.randomUUID(), userId, profile.sub, email, now),
  ]);
  await ensureBootstrapPlatformRole(db, userId, email, now);
  await ensureDefaultTenant(db, { id: userId, displayName: profile.name });
  await writeAudit(db, { userId, action: "auth.google_registered", entityType: "user", entityId: userId, createdAt: now });
  return { id: userId, email, displayName: profile.name, created: true };
}
