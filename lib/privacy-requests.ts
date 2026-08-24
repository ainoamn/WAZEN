/** Fulfill pending privacy export / deletion requests. */

import { prepareAudit } from "./audit";
import { filterSpacesForPlanAccess } from "./plan-retention";

function isoNow() {
  return new Date().toISOString();
}

async function buildUserExportPayload(db: D1Database, userId: string) {
  const user = await db.prepare(
    "SELECT id,email,display_name,locale,currency,timezone,created_at FROM users WHERE id=?",
  ).bind(userId).first<Record<string, unknown>>();
  const { getActivePlanEntitlements } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, userId, { skipSideEffects: true, skipUsage: true });
  const spaces = await db.prepare("SELECT * FROM spaces WHERE owner_user_id=? ORDER BY created_at").bind(userId).all<Record<string, unknown>>();
  const allowedSpaces = filterSpacesForPlanAccess(
    (spaces.results ?? []).map((space) => ({
      ...space,
      id: String(space.id ?? ""),
      type: String(space.type ?? ""),
      grace_until: space.grace_until == null ? null : String(space.grace_until),
      status: space.status == null ? null : String(space.status),
    })),
    entitlements.features,
  );
  const ids = allowedSpaces.map((space) => space.id);
  const placeholders = ids.map(() => "?").join(",");
  const [members, transactions, documents, subscriptions, invoices, payments] = await Promise.all([
    ids.length ? db.prepare(`SELECT * FROM members WHERE space_id IN (${placeholders})`).bind(...ids).all() : Promise.resolve({ results: [] }),
    ids.length ? db.prepare(`SELECT * FROM transactions WHERE space_id IN (${placeholders}) ORDER BY occurred_at`).bind(...ids).all() : Promise.resolve({ results: [] }),
    db.prepare("SELECT * FROM documents WHERE owner_user_id=? ORDER BY issued_at").bind(userId).all(),
    db.prepare("SELECT id,plan_id,status,billing_cycle,current_period_start,current_period_end,created_at FROM subscriptions WHERE user_id=?").bind(userId).all(),
    db.prepare("SELECT id,reference,subtotal_minor,tax_minor,total_minor,currency,status,created_at FROM invoices WHERE user_id=?").bind(userId).all(),
    db.prepare("SELECT id,reference,amount_minor,currency,method,status,occurred_at FROM payments WHERE user_id=?").bind(userId).all(),
  ]);
  return {
    schemaHint: "wazen-privacy-export.v1",
    exportedAt: isoNow(),
    user,
    spaces: allowedSpaces,
    members: members.results ?? [],
    transactions: transactions.results ?? [],
    documents: documents.results ?? [],
    subscriptions: subscriptions.results ?? [],
    invoices: invoices.results ?? [],
    payments: payments.results ?? [],
  };
}

async function fulfillExport(db: D1Database, requestId: string, userId: string, email: string | null) {
  const payload = await buildUserExportPayload(db, userId);
  const artifactId = crypto.randomUUID();
  const now = isoNow();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const json = JSON.stringify(payload);
  // Cap stored artifact size (~2.5MB) — still enough for typical association ledgers.
  if (json.length > 2_500_000) {
    await db.prepare(
      "UPDATE data_requests SET status='failed',completed_at=? WHERE id=? AND status='pending'",
    ).bind(now, requestId).run();
    return { ok: false as const, reason: "EXPORT_TOO_LARGE" };
  }
  await db.batch([
    db.prepare(
      "INSERT INTO privacy_artifacts (id,request_id,user_id,kind,payload_json,created_at,expires_at) VALUES (?,?,?,'export',?,?,?)",
    ).bind(artifactId, requestId, userId, json, now, expiresAt),
    db.prepare(
      "UPDATE data_requests SET status='completed',completed_at=?,artifact_id=? WHERE id=? AND status='pending'",
    ).bind(now, artifactId, requestId),
    prepareAudit(db, {
      userId,
      action: "privacy.export_completed",
      entityType: "data_request",
      entityId: requestId,
      metadata: { artifactId, bytes: json.length },
      createdAt: now,
    }),
  ]);
  if (email) {
    await db.prepare(
      "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
    ).bind(
      crypto.randomUUID(),
      email,
      "privacy_export_ready",
      JSON.stringify({
        requestId,
        artifactId,
        expiresAt,
        messageAr: "تصدير بياناتك جاهز للتنزيل من إعدادات وازن خلال 7 أيام.",
        messageEn: "Your Wazen data export is ready to download from Settings within 7 days.",
      }),
      now,
    ).run();
  }
  return { ok: true as const, artifactId };
}

async function fulfillDeletion(db: D1Database, requestId: string, userId: string, email: string | null) {
  const now = isoNow();
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId),
    db.prepare("UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now, userId),
    db.prepare("UPDATE customer_profiles SET status='closed' WHERE user_id=?").bind(userId),
    db.prepare(
      "UPDATE data_requests SET status='completed',completed_at=? WHERE id=? AND status='pending'",
    ).bind(now, requestId),
    prepareAudit(db, {
      userId,
      action: "privacy.deletion_completed",
      entityType: "data_request",
      entityId: requestId,
      metadata: {
        note: "Account closed; ledger rows retained for legal/accounting retention windows",
      },
      createdAt: now,
    }),
  ]);
  if (email) {
    await db.prepare(
      "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
    ).bind(
      crypto.randomUUID(),
      email,
      "privacy_deletion_done",
      JSON.stringify({
        requestId,
        messageAr: "أُغلق حسابك في وازن وأُلغيت الجلسات. السجلات المالية تُحفظ وفق مدة الاحتفاظ النظامية.",
        messageEn: "Your Wazen account was closed and sessions revoked. Financial ledgers are retained per statutory windows.",
      }),
      now,
    ).run();
  }
  return { ok: true as const };
}

export async function processPrivacyRequests(db: D1Database, options?: { limit?: number }) {
  const limit = Math.min(20, Math.max(1, options?.limit ?? 10));

  const pending = await db.prepare(
    "SELECT id,user_id,type FROM data_requests WHERE status='pending' ORDER BY requested_at LIMIT ?",
  ).bind(limit).all<{ id: string; user_id: string; type: string }>();

  let exports = 0;
  let deletions = 0;
  let failed = 0;
  for (const row of pending.results ?? []) {
    const user = await db.prepare("SELECT email FROM users WHERE id=?").bind(row.user_id).first<{ email: string }>();
    try {
      if (row.type === "export") {
        const result = await fulfillExport(db, row.id, row.user_id, user?.email ?? null);
        if (result.ok) exports += 1;
        else failed += 1;
      } else if (row.type === "deletion") {
        await fulfillDeletion(db, row.id, row.user_id, user?.email ?? null);
        deletions += 1;
      }
    } catch {
      failed += 1;
      await db.prepare(
        "UPDATE data_requests SET status='failed',completed_at=? WHERE id=? AND status='pending'",
      ).bind(isoNow(), row.id).run().catch(() => {});
    }
  }

  // Expire old artifacts
  await db.prepare("DELETE FROM privacy_artifacts WHERE expires_at<=?").bind(isoNow()).run().catch(() => {});

  return {
    ok: true as const,
    processed: pending.results?.length ?? 0,
    exports,
    deletions,
    failed,
  };
}

export async function listPrivacyRequests(db: D1Database, userId: string) {
  const rows = await db.prepare(
    "SELECT id,type,status,requested_at,completed_at,artifact_id FROM data_requests WHERE user_id=? ORDER BY requested_at DESC LIMIT 20",
  ).bind(userId).all<{
    id: string;
    type: string;
    status: string;
    requested_at: string;
    completed_at: string | null;
    artifact_id: string | null;
  }>();
  return rows.results ?? [];
}

export async function loadPrivacyArtifact(db: D1Database, userId: string, requestId: string) {
  const row = await db.prepare(`
    SELECT a.payload_json, a.expires_at, r.status
    FROM privacy_artifacts a
    JOIN data_requests r ON r.id=a.request_id
    WHERE a.request_id=? AND a.user_id=? AND r.user_id=?
    LIMIT 1
  `).bind(requestId, userId, userId).first<{ payload_json: string; expires_at: string; status: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}
