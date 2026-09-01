/** Queue member statement emails after transactions (auto + manual). */

import { appOrigin } from "./app-origin.ts";
import { buildMemberLedger } from "./member-ledger.ts";
import { formatMoneyMinor } from "./money.ts";
import { planHasFeature } from "./plan-features.ts";
import { getActivePlanEntitlements } from "../services/admin/billing-service.ts";
import { flushOutboxByIds, isEmailProviderConfigured } from "./email-provider.ts";
import { signMemberStatementToken } from "./statement-share.ts";
import {
  buildBalanceAlertHtml,
  buildStatementSummaryHtml,
  buildTransactionNoteHtml,
  isGroupSpaceType,
} from "./member-statement-email-content.ts";

export { isGroupSpaceType } from "./member-statement-email-content.ts";

type SpaceLedgerBundle = {
  space: { id: string; name_ar: string; name_en: string; type: string; currency: string; owner_user_id: string };
  plan: { space_id: string; amount_minor: number; duration_months: number; starts_at: string } | null;
  installments: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
  tripExpenses: Array<Record<string, unknown>>;
  expenseSplits: Array<{ expense_id: string; member_id: string; share_minor: number }>;
};

async function loadSpaceLedgerBundle(db: D1Database, spaceId: string): Promise<SpaceLedgerBundle | null> {
  const space = await db.prepare(
    "SELECT id,name_ar,name_en,type,currency,owner_user_id FROM spaces WHERE id=? LIMIT 1",
  ).bind(spaceId).first<{ id: string; name_ar: string; name_en: string; type: string; currency: string; owner_user_id: string }>();
  if (!space || !isGroupSpaceType(space.type)) return null;

  const [plan, installments, transactions, settlements, tripExpenses, expenseSplits] = await Promise.all([
    db.prepare("SELECT space_id,amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
      .bind(spaceId)
      .first<{ space_id: string; amount_minor: number; duration_months: number; starts_at: string }>(),
    db.prepare("SELECT * FROM member_installments WHERE space_id=? ORDER BY period_index").bind(spaceId).all(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at DESC LIMIT 250").bind(spaceId).all(),
    db.prepare("SELECT * FROM settlements WHERE space_id=?").bind(spaceId).all(),
    db.prepare(`SELECT te.id, te.space_id, te.paid_by_member_id, te.amount_minor, te.description, te.occurred_at,
        COALESCE(m.display_name, '') AS paid_by_name, te.paid_from
      FROM trip_expenses te
      LEFT JOIN members m ON m.id=te.paid_by_member_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(spaceId)
      .all(),
    db.prepare(`SELECT es.expense_id, es.member_id, es.share_minor
      FROM expense_splits es
      JOIN trip_expenses te ON te.id=es.expense_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(spaceId)
      .all(),
  ]);

  return {
    space,
    plan: plan ?? null,
    installments: (installments.results ?? []) as Array<Record<string, unknown>>,
    transactions: (transactions.results ?? []) as Array<Record<string, unknown>>,
    settlements: (settlements.results ?? []) as Array<Record<string, unknown>>,
    tripExpenses: (tripExpenses.results ?? []) as Array<Record<string, unknown>>,
    expenseSplits: (expenseSplits.results ?? []) as Array<{ expense_id: string; member_id: string; share_minor: number }>,
  };
}

function resolveOrigin(request?: Request) {
  try {
    return appOrigin(request);
  } catch {
    return "https://wazen.bhd-om.com";
  }
}

export async function queueMemberStatementEmail(input: {
  db: D1Database;
  request?: Request;
  bundle: SpaceLedgerBundle;
  member: {
    id: string;
    space_id: string;
    display_name: string;
    email: string | null | undefined;
    phone?: string | null;
    role?: string;
    due_minor: number;
    paid_minor: number;
    extra_minor: number;
    addon_minor?: number;
    joined_at?: string | null;
  };
  transaction?: {
    description: string;
    amountMinor: number;
    occurredAt: string;
  };
  locale?: "ar" | "en";
  flush?: boolean;
}) {
  const email = String(input.member.email ?? "").trim();
  if (!email) return { queued: false as const, reason: "NO_EMAIL" as const };

  const locale = input.locale ?? "ar";
  const origin = resolveOrigin(input.request);
  const currency = input.bundle.space.currency || "OMR";
  const walletName = locale === "ar" ? input.bundle.space.name_ar : input.bundle.space.name_en;
  const memberInstallments = input.bundle.installments.filter(
    (row) => String(row.member_id ?? "") === input.member.id,
  );

  const ledger = buildMemberLedger({
    member: {
      id: input.member.id,
      space_id: input.member.space_id,
      display_name: input.member.display_name,
      email: input.member.email,
      phone: input.member.phone,
      role: input.member.role,
      due_minor: Number(input.member.due_minor),
      paid_minor: Number(input.member.paid_minor),
      extra_minor: Number(input.member.extra_minor),
      addon_minor: Number(input.member.addon_minor ?? 0),
      joined_at: input.member.joined_at ?? undefined,
    },
    spaceNameAr: input.bundle.space.name_ar,
    spaceNameEn: input.bundle.space.name_en,
    currency,
    plan: input.bundle.plan,
    installments: memberInstallments as never[],
    transactions: input.bundle.transactions as never[],
    settlements: input.bundle.settlements as never[],
    tripExpenses: input.bundle.tripExpenses as never[],
    expenseSplits: input.bundle.expenseSplits,
  });

  const money = (minor: number) => formatMoneyMinor(minor, currency, locale);
  const owesLabel = money(ledger.owesMinor);
  const creditLabel = money(ledger.creditMinor);
  const shareToken = signMemberStatementToken({
    memberId: input.member.id,
    spaceId: input.member.space_id,
    focus: "all",
    locale,
  });
  const statementUrl = `${origin}/s/${encodeURIComponent(shareToken)}`;
  const statementSummaryHtml = buildStatementSummaryHtml({ locale, currency, ledger });
  const balanceAlertHtml = buildBalanceAlertHtml({
    locale,
    owesLabel,
    creditLabel,
    owesMinor: ledger.owesMinor,
    creditMinor: ledger.creditMinor,
  });
  const transactionNoteHtml = input.transaction
    ? buildTransactionNoteHtml({
      locale,
      description: input.transaction.description,
      amountLabel: money(input.transaction.amountMinor),
      dateLabel: new Date(input.transaction.occurredAt).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB"),
    })
    : "";

  const plainLines = locale === "ar"
    ? [
        `السلام عليكم ${input.member.display_name}`,
        "",
        `تحديث حسابكم في ${walletName}.`,
        input.transaction ? `معاملة جديدة: ${input.transaction.description} — ${money(input.transaction.amountMinor)}` : "",
        ledger.owesMinor > 0 ? `تنبيه: عليك للجمعية مبلغ ${owesLabel}` : "",
        ledger.creditMinor > 0 && ledger.owesMinor <= 0 ? `له: ${creditLabel}` : "",
        `المدفوع: ${money(ledger.paidMinor)} · عليه: ${owesLabel} · له: ${creditLabel}`,
        "",
        "الكشف التفصيلي:",
        statementUrl,
      ].filter(Boolean)
    : [
        `Hello ${input.member.display_name}`,
        "",
        `Account update for ${walletName}.`,
        input.transaction ? `New transaction: ${input.transaction.description} — ${money(input.transaction.amountMinor)}` : "",
        ledger.owesMinor > 0 ? `Reminder: you owe ${owesLabel}` : "",
        ledger.creditMinor > 0 && ledger.owesMinor <= 0 ? `Credit: ${creditLabel}` : "",
        `Paid: ${money(ledger.paidMinor)} · Owes: ${owesLabel} · Credit: ${creditLabel}`,
        "",
        "Full statement:",
        statementUrl,
      ].filter(Boolean);

  const createdAt = new Date().toISOString();
  const outboxId = crypto.randomUUID();
  await input.db.prepare(
    "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
  ).bind(
    outboxId,
    email,
    "member_statement",
    JSON.stringify({
      displayName: input.member.display_name,
      walletName,
      locale,
      message: plainLines.join("\n"),
      messageHtml: statementSummaryHtml,
      balanceAlertHtml,
      transactionNoteHtml,
      owesLabel,
      creditLabel,
      statementUrl,
      link: statementUrl,
      receiptUrl: statementUrl,
    }),
    createdAt,
  ).run();

  if (input.flush !== false && isEmailProviderConfigured()) {
    await flushOutboxByIds(input.db, [outboxId]).catch(() => {});
  }
  return { queued: true as const, outboxId, statementUrl };
}

export async function queueSpaceMemberStatementEmails(input: {
  db: D1Database;
  request?: Request;
  spaceId: string;
  ownerUserId: string;
  transaction?: {
    description: string;
    amountMinor: number;
    occurredAt: string;
  };
  memberIds?: string[];
  locale?: "ar" | "en";
  flush?: boolean;
  requireEmailFeature?: boolean;
}) {
  const entitlements = await getActivePlanEntitlements(input.db, input.ownerUserId, { skipSideEffects: true, skipUsage: true });
  if (input.requireEmailFeature !== false && !planHasFeature(entitlements.features, "email")) {
    return { queued: 0, skipped: 0, reason: "PLAN_FEATURE_REQUIRED" as const };
  }

  const bundle = await loadSpaceLedgerBundle(input.db, input.spaceId);
  if (!bundle) return { queued: 0, skipped: 0, reason: "NOT_GROUP_SPACE" as const };

  const members = await input.db.prepare(`
    SELECT id, space_id, display_name, email, phone, role, due_minor, paid_minor, extra_minor, addon_minor, joined_at
    FROM members WHERE space_id=? AND status='active'
  `).bind(input.spaceId).all<{
    id: string;
    space_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    role: string;
    due_minor: number;
    paid_minor: number;
    extra_minor: number;
    addon_minor: number | null;
    joined_at: string | null;
  }>();

  const filter = new Set((input.memberIds ?? []).map(String));
  const targets = (members.results ?? []).filter((member) => {
    if (filter.size && !filter.has(member.id)) return false;
    return Boolean(String(member.email ?? "").trim());
  });

  const outboxIds: string[] = [];
  let queued = 0;
  let skipped = (members.results ?? []).length - targets.length;

  for (const member of targets) {
    const result = await queueMemberStatementEmail({
      db: input.db,
      request: input.request,
      bundle,
      member: {
        ...member,
        addon_minor: member.addon_minor ?? undefined,
      },
      transaction: input.transaction,
      locale: input.locale,
      flush: false,
    });
    if (result.queued) {
      queued += 1;
      outboxIds.push(result.outboxId);
    } else {
      skipped += 1;
    }
  }

  if (input.flush !== false && outboxIds.length && isEmailProviderConfigured()) {
    await flushOutboxByIds(input.db, outboxIds).catch(() => {});
  }

  return { queued, skipped, outboxIds };
}
