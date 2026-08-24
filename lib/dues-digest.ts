/** Daily overdue-dues digest for wallet owners (notifications + optional email). */

import { upsertUserNotifications } from "./user-notifications";
import { enqueuePushOutbox } from "./web-push";
import { formatMoneyMinor } from "./money";

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function runDuesDigest(db: D1Database, options?: { limitOwners?: number }) {
  const day = utcDay();
  const limitOwners = Math.min(200, Math.max(1, options?.limitOwners ?? 50));

  const overdue = await db.prepare(`
    SELECT m.id AS member_id, m.display_name, m.due_minor, m.paid_minor, m.space_id,
           s.name_ar, s.name_en, s.currency, s.owner_user_id, s.type
    FROM members m
    JOIN spaces s ON s.id=m.space_id
    WHERE COALESCE(m.status,'active')='active'
      AND COALESCE(s.status,'active')='active'
      AND s.type IN ('society','group','household','trip')
      AND (m.due_minor - m.paid_minor) > 0
    ORDER BY s.owner_user_id, (m.due_minor - m.paid_minor) DESC
    LIMIT 2000
  `).all<{
    member_id: string;
    display_name: string;
    due_minor: number;
    paid_minor: number;
    space_id: string;
    name_ar: string;
    name_en: string;
    currency: string;
    owner_user_id: string;
    type: string;
  }>();

  const byOwner = new Map<string, typeof overdue.results>();
  for (const row of overdue.results ?? []) {
    const list = byOwner.get(row.owner_user_id) ?? [];
    list.push(row);
    byOwner.set(row.owner_user_id, list);
  }

  let ownersNotified = 0;
  let skipped = 0;
  let emailsQueued = 0;

  for (const [ownerId, rows] of byOwner) {
    if (ownersNotified >= limitOwners) break;
    const already = await db.prepare(
      "SELECT id FROM dues_digest_log WHERE user_id=? AND digest_day=?",
    ).bind(ownerId, day).first();
    if (already) {
      skipped += 1;
      continue;
    }

    const count = rows.length;
    const sample = rows.slice(0, 3).map((row) => row.display_name).join("، ");
    const currency = rows[0]?.currency || "OMR";
    const outstanding = rows.reduce((sum, row) => sum + (Number(row.due_minor) - Number(row.paid_minor)), 0);
    const amountLabel = formatMoneyMinor(outstanding, currency, "ar");
    const ar = `${count} عضو عليهم مستحقات (مثل: ${sample}${count > 3 ? "…" : ""}) — إجمالي تقريبي ${amountLabel}.`;
    const en = `${count} member(s) with outstanding dues (e.g. ${sample}${count > 3 ? "…" : ""}) — about ${formatMoneyMinor(outstanding, currency, "en")}.`;

    await upsertUserNotifications(db, ownerId, [{
      id: `dues-digest:${day}`,
      severity: "warning",
      href: "/home",
      ar,
      en,
    }]);

    try {
      await enqueuePushOutbox(
        db,
        ownerId,
        { title: "WAZEN · مستحقات", body: ar.slice(0, 160), url: "/home", tag: `dues-${day}` },
        `dues-digest:${day}`,
      );
    } catch { /* best-effort */ }

    const owner = await db.prepare("SELECT email FROM users WHERE id=?").bind(ownerId).first<{ email: string }>();
    if (owner?.email) {
      const createdAt = new Date().toISOString();
      await db.prepare(
        "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
      ).bind(
        crypto.randomUUID(),
        owner.email,
        "dues_digest",
        JSON.stringify({
          overdueCount: count,
          outstandingMinor: outstanding,
          currency,
          sampleNames: rows.slice(0, 5).map((row) => row.display_name),
          messageAr: ar,
          messageEn: en,
        }),
        createdAt,
      ).run();
      emailsQueued += 1;
    }

    await db.prepare(
      "INSERT INTO dues_digest_log (id,user_id,digest_day,overdue_count,created_at) VALUES (?,?,?,?,?)",
    ).bind(crypto.randomUUID(), ownerId, day, count, new Date().toISOString()).run();
    ownersNotified += 1;
  }

  return {
    ok: true as const,
    digestDay: day,
    overdueRows: overdue.results?.length ?? 0,
    ownersNotified,
    skipped,
    emailsQueued,
  };
}
