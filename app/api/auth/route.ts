import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../db/runtime";
import { authenticateRequest, clearCsrfCookie, clearSessionCookie, createSession, createSessionToken, csrfCookie, hashPassword, issueCsrfToken, normalizeEmail, revokeSession, sessionHeaders, sha256, verifyPassword } from "../../../lib/auth";
import { ApiError, enforceCsrf, enforceWriteRequest, errorResponse, rateLimit } from "../../../lib/security";
import { writeAudit } from "../../../lib/audit";
import { decryptSecret, encryptSecret, loadKeyring } from "../../../lib/encryption";
import { createTotpSecret, verifyTotp } from "../../../lib/totp";
import { ensureDefaultTenant } from "../../../lib/authorization";

const credentialsSchema = z.object({
  action: z.enum(["register", "login", "logout", "verifyEmail", "forgotPassword", "resetPassword", "changePassword", "beginTotp", "confirmTotp", "disableTotp"]),
  email: z.email().max(254).optional(), password: z.string().min(12).max(128).optional(),
  currentPassword: z.string().min(12).max(128).optional(), newPassword: z.string().min(12).max(128).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  token: z.string().min(40).max(200).optional(),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

export async function GET(request: Request) {
  try {
    const db = getRawDb(); await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) return Response.json({ authenticated: false }, { status: 401 });
    const issued = user.authType === "session" ? await issueCsrfToken(db, request) : null;
    const headers = new Headers({ "Cache-Control": "no-store" }); if (issued) headers.append("Set-Cookie", csrfCookie(issued.csrfToken, issued.expiresAt));
    return Response.json({ authenticated: true, user }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    enforceWriteRequest(request, 16_384);
    const db = getRawDb(); await ensureSchema(db); await rateLimit(db, request, "auth", 10, 900);
    const parsed = credentialsSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "INVALID_CREDENTIALS");
    const { action } = parsed.data;
    if (action === "logout") {
      const user = await authenticateRequest(db, request); if (user?.authType === "session") await enforceCsrf(db, request);
      await revokeSession(db, request);
      const headers = new Headers(); headers.append("Set-Cookie", clearSessionCookie()); headers.append("Set-Cookie", clearCsrfCookie());
      return Response.json({ ok: true }, { headers });
    }
    if (["changePassword", "beginTotp", "confirmTotp", "disableTotp"].includes(action)) {
      const user = await authenticateRequest(db, request); if (!user || user.authType !== "session") throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      await enforceCsrf(db, request);
      if (action === "changePassword") {
        const currentPassword = parsed.data.currentPassword ?? ""; const newPassword = parsed.data.newPassword ?? "";
        if (currentPassword === newPassword) throw new ApiError(400, "PASSWORD_MUST_CHANGE");
        const credential = await db.prepare("SELECT password_hash,password_salt,password_iterations FROM auth_credentials WHERE user_id=?").bind(user.id).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
        if (!credential || !(await verifyPassword(currentPassword, credential.password_hash, credential.password_salt, Number(credential.password_iterations)))) throw new ApiError(401, "INVALID_CREDENTIALS");
        const next = await hashPassword(newPassword); const changedAt = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE auth_credentials SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE user_id=?").bind(next.hash, next.salt, next.iterations, changedAt, user.id),
          db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id),
        ]);
        await writeAudit(db, { userId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id, createdAt: changedAt });
        const session = await createSession(db, user.id); return Response.json({ ok: true }, { headers: sessionHeaders(session) });
      }
      const credential = await db.prepare("SELECT password_hash,password_salt,password_iterations FROM auth_credentials WHERE user_id=?").bind(user.id).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
      if (action === "beginTotp" || action === "disableTotp") {
        if (!credential || !(await verifyPassword(parsed.data.currentPassword ?? "", credential.password_hash, credential.password_salt, Number(credential.password_iterations)))) throw new ApiError(401, "INVALID_CREDENTIALS");
      }
      if (action === "beginTotp") {
        const secret = createTotpSecret(); const keyring = loadKeyring(); const encrypted = await encryptSecret(secret, `totp:${user.id}`, keyring); const createdAt = new Date().toISOString();
        await db.prepare(`INSERT INTO totp_credentials (user_id,encrypted_secret,key_version,last_used_step,enabled_at,created_at,updated_at) VALUES (?,?,?,NULL,NULL,?,?)
          ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,key_version=excluded.key_version,last_used_step=NULL,enabled_at=NULL,updated_at=excluded.updated_at`)
          .bind(user.id, encrypted, keyring.active, createdAt, createdAt).run();
        await writeAudit(db, { userId: user.id, action: "auth.totp_enrollment_started", entityType: "user", entityId: user.id });
        const label = encodeURIComponent(user.email); return Response.json({ ok: true, secret, otpauthUri: `otpauth://totp/WAZEN:${label}?secret=${secret}&issuer=WAZEN&algorithm=SHA1&digits=6&period=30` });
      }
      if (action === "confirmTotp") {
        const row = await db.prepare("SELECT encrypted_secret,last_used_step,enabled_at FROM totp_credentials WHERE user_id=?").bind(user.id).first<{ encrypted_secret: string; last_used_step: number | null; enabled_at: string | null }>();
        if (!row || row.enabled_at) throw new ApiError(409, "TOTP_ENROLLMENT_UNAVAILABLE");
        const secret = await decryptSecret(row.encrypted_secret, `totp:${user.id}`); const result = await verifyTotp(secret.value, parsed.data.totpCode ?? "", { window: 1, lastUsedStep: row.last_used_step });
        if (!result.valid) throw new ApiError(401, "INVALID_TOTP"); const enabledAt = new Date().toISOString();
        await db.prepare("UPDATE totp_credentials SET enabled_at=?,last_used_step=?,updated_at=? WHERE user_id=? AND enabled_at IS NULL").bind(enabledAt, result.step, enabledAt, user.id).run();
        await writeAudit(db, { userId: user.id, action: "auth.totp_enabled", entityType: "user", entityId: user.id }); return Response.json({ ok: true });
      }
      await db.prepare("DELETE FROM totp_credentials WHERE user_id=?").bind(user.id).run(); await db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id).run();
      await writeAudit(db, { userId: user.id, action: "auth.totp_disabled", entityType: "user", entityId: user.id }); const session = await createSession(db, user.id);
      return Response.json({ ok: true }, { headers: sessionHeaders(session) });
    }
    if (action === "verifyEmail") {
      const verification = await db.prepare(`SELECT t.id,t.user_id,u.email,u.display_name,p.status FROM email_verification_tokens t
        JOIN users u ON u.id=t.user_id LEFT JOIN customer_profiles p ON p.user_id=u.id
        WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>? LIMIT 1`)
        .bind(await sha256(parsed.data.token ?? ""), new Date().toISOString())
        .first<{ id: string; user_id: string; email: string; display_name: string; status: string }>();
      if (!verification || verification.status !== "active") throw new ApiError(400, "INVALID_VERIFICATION_TOKEN");
      const verifiedAt = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE auth_credentials SET email_verified_at=?,updated_at=? WHERE user_id=?").bind(verifiedAt, verifiedAt, verification.user_id),
        db.prepare("UPDATE email_verification_tokens SET used_at=? WHERE id=?").bind(verifiedAt, verification.id),
      ]);
      await writeAudit(db, { userId: verification.user_id, action: "auth.email_verified", entityType: "user", entityId: verification.user_id, createdAt: verifiedAt });
      const session = await createSession(db, verification.user_id);
      return Response.json({ ok: true }, { headers: sessionHeaders(session) });
    }
    if (action === "forgotPassword") {
      const recoveryEmail = normalizeEmail(parsed.data.email ?? "");
      const account = recoveryEmail ? await db.prepare("SELECT id,display_name FROM users WHERE email=? COLLATE NOCASE").bind(recoveryEmail).first<{ id: string; display_name: string }>() : null;
      if (account) {
        const token = createSessionToken(); const createdAt = new Date().toISOString(); const origin = new URL(process.env.WAZEN_APP_ORIGIN ?? request.url).origin;
        await db.batch([
          db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL").bind(createdAt, account.id),
          db.prepare("INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), account.id, await sha256(token), new Date(Date.now() + 3_600_000).toISOString(), createdAt),
          db.prepare("INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)").bind(crypto.randomUUID(), recoveryEmail, "reset_password", JSON.stringify({ displayName: account.display_name, link: `${origin}/reset-password?token=${encodeURIComponent(token)}` }), createdAt),
        ]);
      }
      return Response.json({ ok: true });
    }
    if (action === "resetPassword") {
      const password = parsed.data.password ?? ""; const token = parsed.data.token ?? "";
      if (password.length < 12 || token.length < 40) throw new ApiError(400, "INVALID_RESET_REQUEST");
      const reset = await db.prepare("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1").bind(await sha256(token), new Date().toISOString()).first<{ id: string; user_id: string }>();
      if (!reset) throw new ApiError(400, "INVALID_RESET_TOKEN");
      const passwordData = await hashPassword(password); const resetAt = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE auth_credentials SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE user_id=?").bind(passwordData.hash, passwordData.salt, passwordData.iterations, resetAt, reset.user_id),
        db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").bind(resetAt, reset.id),
        db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(reset.user_id),
      ]);
      await writeAudit(db, { userId: reset.user_id, action: "auth.password_reset", entityType: "user", entityId: reset.user_id, createdAt: resetAt });
      const session = await createSession(db, reset.user_id);
      return Response.json({ ok: true }, { headers: sessionHeaders(session) });
    }
    const email = normalizeEmail(parsed.data.email ?? ""); const password = parsed.data.password ?? "";
    if (!email || !password) throw new ApiError(400, "INVALID_CREDENTIALS");
    if (action === "register") {
      const displayName = parsed.data.displayName?.trim() ?? "";
      if (!displayName) throw new ApiError(400, "INVALID_PROFILE");
      if (await db.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE").bind(email).first()) throw new ApiError(409, "EMAIL_ALREADY_USED");
      const userId = crypto.randomUUID(); const createdAt = new Date().toISOString();
      const passwordData = await hashPassword(password);
      const verificationToken = createSessionToken(); const verificationHash = await sha256(verificationToken);
      const origin = new URL(process.env.WAZEN_APP_ORIGIN ?? request.url).origin;
      const configuredAdmins = (process.env.WAZEN_ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean);
      const role = configuredAdmins.includes(email) ? "super_admin" : "customer";
      await db.batch([
        db.prepare("INSERT INTO users (id,email,display_name,locale,currency,created_at) VALUES (?,?,?,'ar','SAR',?)").bind(userId, email, displayName, createdAt),
        db.prepare("INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','SA',?,?)").bind(userId, createdAt, createdAt),
        db.prepare("INSERT INTO platform_roles (user_id,role,permissions_json,created_at,updated_at) VALUES (?,?,?,?,?)").bind(userId, role, role === "super_admin" ? '["*"]' : '["wallets:own","documents:own"]', createdAt, createdAt),
        db.prepare("INSERT INTO auth_credentials (user_id,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(userId, passwordData.hash, passwordData.salt, passwordData.iterations, createdAt, createdAt),
        db.prepare("INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), userId, verificationHash, new Date(Date.now() + 86_400_000).toISOString(), createdAt),
        db.prepare("INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)").bind(crypto.randomUUID(), email, "verify_email", JSON.stringify({ displayName, link: `${origin}/verify-email?token=${encodeURIComponent(verificationToken)}` }), createdAt),
      ]);
      await ensureDefaultTenant(db, { id: userId, displayName });
      await writeAudit(db, { userId, action: "auth.registered", entityType: "user", entityId: userId, createdAt });
      return Response.json({ ok: true, verificationRequired: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const row = await db.prepare(`SELECT u.id,u.email,u.display_name,c.password_hash,c.password_salt,c.password_iterations,c.email_verified_at,p.status,t.encrypted_secret,t.last_used_step,t.enabled_at
      FROM users u JOIN auth_credentials c ON c.user_id=u.id LEFT JOIN customer_profiles p ON p.user_id=u.id
      LEFT JOIN totp_credentials t ON t.user_id=u.id
      WHERE u.email=? COLLATE NOCASE LIMIT 1`).bind(email).first<{ id: string; email: string; display_name: string; password_hash: string; password_salt: string; password_iterations: number; email_verified_at: string | null; status: string }>();
    const valid = row && await verifyPassword(password, row.password_hash, row.password_salt, Number(row.password_iterations));
    if (!row || !valid) throw new ApiError(401, "INVALID_CREDENTIALS");
    if (row.status === "suspended" || row.status === "closed") throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
    if (!row.email_verified_at) throw new ApiError(403, "EMAIL_NOT_VERIFIED");
    const totp = row as typeof row & { encrypted_secret?: string | null; last_used_step?: number | null; enabled_at?: string | null };
    if (totp.enabled_at && totp.encrypted_secret) {
      if (!parsed.data.totpCode) throw new ApiError(401, "TOTP_REQUIRED");
      const secret = await decryptSecret(totp.encrypted_secret, `totp:${row.id}`); const result = await verifyTotp(secret.value, parsed.data.totpCode, { window: 1, lastUsedStep: totp.last_used_step });
      if (!result.valid) throw new ApiError(401, "INVALID_TOTP");
      const update = await db.prepare("UPDATE totp_credentials SET last_used_step=?,updated_at=? WHERE user_id=? AND (last_used_step IS NULL OR last_used_step<?)").bind(result.step, new Date().toISOString(), row.id, result.step).run();
      if (Number(update.meta.changes) !== 1) throw new ApiError(401, "TOTP_REPLAYED");
    }
    const session = await createSession(db, row.id);
    return Response.json({ ok: true, user: { id: row.id, email: row.email, displayName: row.display_name, isDemo: false } }, { headers: sessionHeaders(session) });
  } catch (error) { return errorResponse(error); }
}
