import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../lib/security";
import { loadKeyring, rotateSecret } from "../../../../lib/encryption";
import { sanitizeAuditMetadata } from "../../../../lib/audit";
import { idleCutoffIso } from "../../../../lib/session-policy";
import {
  archiveExpiredGraceSpaces,
  expireLapsedPaidSubscriptions,
  purgeExpiredRetentionArchives,
} from "../../../../lib/plan-retention";

export async function POST(request: Request) {
  try {
    const secret = process.env.WAZEN_JOB_SECRET ?? "";
    if (secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError(401, "UNAUTHORIZED");
    const db = getRawDb(); await ensureSchema(db); const now = new Date().toISOString();
    await db.batch([
      db.prepare("DELETE FROM auth_sessions WHERE expires_at<=? OR last_seen_at<=?").bind(now, idleCutoffIso()),
      db.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
      db.prepare("DELETE FROM idempotency_keys WHERE expires_at<=?").bind(now),
      db.prepare("DELETE FROM email_verification_tokens WHERE expires_at<=?").bind(now),
      db.prepare("DELETE FROM password_reset_tokens WHERE expires_at<=?").bind(now),
      db.prepare("UPDATE invites SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now),
      db.prepare(`UPDATE coupon_redemptions SET status='expired' WHERE status='reserved' AND invoice_id IN
        (SELECT id FROM invoices WHERE status!='paid' AND due_at<=?)`).bind(now),
    ]);
    let rotated = 0; let auditRowsSanitized = 0;
    if (process.env.WAZEN_ENCRYPTION_KEYRING) {
      const keyring = loadKeyring(); const statements: D1PreparedStatement[] = [];
      const providers = await db.prepare("SELECT tenant_id,provider,encrypted_config FROM payment_provider_settings WHERE key_version<>? LIMIT 50").bind(keyring.active).all<{ tenant_id: string; provider: string; encrypted_config: string }>();
      for (const row of providers.results) statements.push(db.prepare("UPDATE payment_provider_settings SET encrypted_config=?,key_version=?,updated_at=? WHERE tenant_id=? AND provider=?").bind(await rotateSecret(row.encrypted_config, `payment-provider:${row.provider}`, keyring), keyring.active, now, row.tenant_id, row.provider));
      const totpRows = await db.prepare("SELECT user_id,encrypted_secret FROM totp_credentials WHERE key_version<>? LIMIT 50").bind(keyring.active).all<{ user_id: string; encrypted_secret: string }>();
      for (const row of totpRows.results) statements.push(db.prepare("UPDATE totp_credentials SET encrypted_secret=?,key_version=?,updated_at=? WHERE user_id=?").bind(await rotateSecret(row.encrypted_secret, `totp:${row.user_id}`, keyring), keyring.active, now, row.user_id));
      if (statements.length) await db.batch(statements); rotated = statements.length;
    }
    const auditRows = await db.prepare("SELECT id,metadata_json FROM audit_logs ORDER BY created_at DESC LIMIT 500").all<{ id: string; metadata_json: string }>();
    const auditStatements: D1PreparedStatement[] = [];
    for (const row of auditRows.results) {
      let metadata: unknown; try { metadata = JSON.parse(row.metadata_json); } catch { metadata = {}; }
      const sanitized = JSON.stringify(sanitizeAuditMetadata(metadata));
      if (sanitized !== row.metadata_json) auditStatements.push(db.prepare("UPDATE audit_logs SET metadata_json=? WHERE id=?").bind(sanitized, row.id));
    }
    if (auditStatements.length) await db.batch(auditStatements); auditRowsSanitized = auditStatements.length;

    const { ensurePendingPlanColumns } = await import("../../../../lib/plan-change");
    await ensurePendingPlanColumns(db);
    const expired = await expireLapsedPaidSubscriptions(db);
    const archived = await archiveExpiredGraceSpaces(db);
    const purged = await purgeExpiredRetentionArchives(db);

    return Response.json({
      ok: true,
      cleanedAt: now,
      encryptedRowsRotated: rotated,
      auditRowsSanitized,
      subscriptionsExpired: expired.expired,
      retentionArchived: archived.archived,
      retentionPurged: purged.purged,
    });
  } catch (error) { return errorResponse(error); }
}
