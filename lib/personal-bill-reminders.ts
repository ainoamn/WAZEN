/** Daily personal-bill reminders: in-app, email, and WhatsApp the day before and on the due day. */

import { appOrigin } from "./app-origin";
import { formatMoneyMinor } from "./money";
import { reminderKindForDue } from "./personal-finance";
import { upsertUserNotifications } from "./user-notifications";
import { enqueuePushOutbox } from "./web-push";
import { enqueueMessage } from "./messaging-provider";
import { generateV1PersonalOccurrences } from "./v1-rules";

function publicOrigin() {
  try {
    return appOrigin();
  } catch {
    return "https://wazen.bhd-om.com";
  }
}

function reminderCopy(row: {
  rule_name: string;
  expected_minor: number;
  due_at: string;
  kind: "due" | "eve";
  total_minor: number;
  paid_minor: number;
  spaceName: string;
}) {
  const amountAr = formatMoneyMinor(row.expected_minor, "OMR", "ar");
  const amountEn = formatMoneyMinor(row.expected_minor, "OMR", "en");
  const remaining = Math.max(0, row.total_minor - row.paid_minor);
  const remainingAr = remaining > 0 ? `\nالمدفوع ${formatMoneyMinor(row.paid_minor, "OMR", "ar")} · المتبقي ${formatMoneyMinor(remaining, "OMR", "ar")}` : "";
  const remainingEn = remaining > 0 ? `\nPaid ${formatMoneyMinor(row.paid_minor, "OMR", "en")} · remaining ${formatMoneyMinor(remaining, "OMR", "en")}` : "";
  const whenAr = row.kind === "eve" ? "غداً" : "اليوم";
  const whenEn = row.kind === "eve" ? "tomorrow" : "today";
  const due = row.due_at.slice(0, 10);
  const ar = `تذكير دفع متكرر: ${whenAr} يستحق «${row.rule_name}» بمبلغ ${amountAr} (${due}).${remainingAr}\nمحفظة ${row.spaceName}. افتح وازن لاعتماد الدفع.`;
  const en = `Recurring payment reminder: ${whenEn} “${row.rule_name}” is due (${amountEn}, ${due}).${remainingEn}\nWallet ${row.spaceName}. Open Wazen to mark it paid.`;
  return { ar, en };
}

export async function runPersonalBillReminders(db: D1Database, options?: { asOf?: Date; limit?: number }) {
  const asOf = options?.asOf ?? new Date();
  const day = asOf.toISOString().slice(0, 10);
  const limit = Math.min(400, Math.max(1, options?.limit ?? 120));

  const spaces = await db.prepare("SELECT id FROM spaces WHERE type='personal' AND COALESCE(status,'active')='active'")
    .all<{ id: string }>();
  const spaceIds = (spaces.results ?? []).map((row) => row.id);
  if (spaceIds.length) {
    try { await generateV1PersonalOccurrences(db, spaceIds); } catch { /* keep sending for rows that already exist */ }
  }

  const pending = await db.prepare(`
    SELECT o.id, o.space_id, o.due_at, o.expected_minor, o.status,
           r.name AS rule_name, r.kind AS rule_kind, r.total_minor, r.paid_minor,
           s.name_ar, s.name_en, s.owner_user_id, s.currency
    FROM personal_occurrences o
    JOIN personal_rules r ON r.id=o.rule_id
    JOIN spaces s ON s.id=o.space_id
    WHERE o.status='pending'
      AND r.status='active'
      AND r.kind='expense'
      AND COALESCE(s.status,'active')='active'
      AND s.type='personal'
    ORDER BY o.due_at
    LIMIT 800
  `).all<{
    id: string;
    space_id: string;
    due_at: string;
    expected_minor: number;
    status: string;
    rule_name: string;
    rule_kind: string;
    total_minor: number;
    paid_minor: number;
    name_ar: string;
    name_en: string;
    owner_user_id: string;
    currency: string;
  }>();

  let sent = 0;
  let skipped = 0;
  let emailsQueued = 0;
  let whatsappQueued = 0;

  for (const row of pending.results ?? []) {
    if (sent >= limit) break;
    const kind = reminderKindForDue(row.due_at, asOf);
    if (!kind) continue;
    const already = await db.prepare(
      "SELECT id FROM personal_reminder_log WHERE occurrence_id=? AND reminder_kind=? AND reminder_day=?",
    ).bind(row.id, kind, day).first();
    if (already) {
      skipped += 1;
      continue;
    }

    const copy = reminderCopy({
      rule_name: row.rule_name,
      expected_minor: Number(row.expected_minor) || 0,
      due_at: row.due_at,
      kind,
      total_minor: Number(row.total_minor) || 0,
      paid_minor: Number(row.paid_minor) || 0,
      spaceName: row.name_ar || row.name_en || "وازن",
    });
    const path = `/dashboard?view=personal&space=${encodeURIComponent(row.space_id)}`;
    const href = `${publicOrigin()}${path}`;

    await upsertUserNotifications(db, row.owner_user_id, [{
      id: `personal-bill:${kind}:${row.id}`,
      severity: kind === "due" ? "warning" : "info",
      href: path,
      ar: copy.ar.split("\n")[0],
      en: copy.en.split("\n")[0],
    }]);
    try {
      await enqueuePushOutbox(
        db,
        row.owner_user_id,
        { title: kind === "due" ? "وازون · استحقاق اليوم" : "وازون · تذكير غداً", body: copy.ar.slice(0, 160), url: path, tag: `personal-bill-${row.id}-${kind}` },
        `personal-bill:${kind}:${row.id}:${day}`,
      );
    } catch { /* best-effort */ }

    const owner = await db.prepare("SELECT email FROM users WHERE id=?").bind(row.owner_user_id).first<{ email: string }>();
    if (owner?.email) {
      await db.prepare(
        "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
      ).bind(
        crypto.randomUUID(),
        owner.email,
        "personal_bill_reminder",
        JSON.stringify({
          locale: "ar",
          messageAr: copy.ar,
          messageEn: copy.en,
          messageHtml: copy.ar.replace(/\n/g, "<br/>"),
          link: href,
        }),
        asOf.toISOString(),
      ).run();
      emailsQueued += 1;
    }

    const phoneRow = await db.prepare(
      "SELECT phone FROM members WHERE user_id=? AND phone IS NOT NULL AND TRIM(phone)<>'' ORDER BY joined_at DESC LIMIT 1",
    ).bind(row.owner_user_id).first<{ phone: string }>();
    if (phoneRow?.phone) {
      const waId = await enqueueMessage(db, {
        channel: "whatsapp",
        recipient: phoneRow.phone,
        template: "personal_bill_reminder",
        payload: { body: copy.ar, locale: "ar", spaceName: row.name_ar, link: href },
        createdAt: asOf.toISOString(),
      });
      if (waId) whatsappQueued += 1;
    }

    await db.prepare(
      "INSERT INTO personal_reminder_log (id,occurrence_id,reminder_kind,reminder_day,created_at) VALUES (?,?,?,?,?)",
    ).bind(crypto.randomUUID(), row.id, kind, day, asOf.toISOString()).run();
    sent += 1;
  }

  return {
    ok: true as const,
    reminderDay: day,
    sent,
    skipped,
    emailsQueued,
    whatsappQueued,
    pendingRows: pending.results?.length ?? 0,
  };
}
