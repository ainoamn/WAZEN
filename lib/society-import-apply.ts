/** Apply a SocietyImportPack into Neon/D1 in one request (batched for speed). */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { authorizeSpace, ensureDefaultTenant, platformRoleOf } from "./authorization";
import { splitContributionPayment } from "./finance";
import { installmentInsertStatements } from "./installment-payments";
import { reconcileMemberLedgers, writeApprovedCashBalance } from "./ledger-void";
import { multiplyMinor, parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "./money";
import { digitsOnly, isLikelyPhone, toWhatsAppNumber } from "./phone";
import { filterSpacesByPlan } from "./plan-features";
import { ApiError } from "./security";
import {
  normalizePersonKey,
  type SocietyImportPack,
} from "./society-import";
import { addMonthsIso, inferHoldingDurationMonths, normalizeHoldingKind } from "./space-holdings";

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 48) || "user";
}

function toIsoDate(value: string | undefined, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function moneyMajor(value: number | string, currency: string) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return 0;
  return parseNonNegativeMoneyToMinor(text, currency);
}

function indexPhone(map: Map<string, string>, phone: string | null | undefined, memberId: string) {
  if (!phone) return;
  const digits = digitsOnly(phone);
  if (!digits) return;
  map.set(digits, memberId);
  const wa = toWhatsAppNumber(digits);
  if (wa) map.set(wa, memberId);
  if (wa.startsWith("968") && wa.length === 11) map.set(wa.slice(3), memberId);
}

function resolveMemberId(
  byName: Map<string, string>,
  byPhone: Map<string, string>,
  memberName: string,
  phone?: string,
) {
  const digits = digitsOnly(phone || "");
  if (digits) {
    const hit = byPhone.get(digits)
      || byPhone.get(toWhatsAppNumber(digits))
      || (digits.length === 8 ? byPhone.get(`968${digits}`) : undefined);
    if (hit) return hit;
  }
  return byName.get(normalizePersonKey(memberName));
}

function looksLikeOpeningRow(memberName: string, note?: string) {
  const blob = `${memberName} ${note ?? ""}`;
  return /مبالغ\s*سابقة|مبالغ\s*أخرى|الجمعية السابقة|رصيد افتتاح/.test(blob);
}

async function flushBatches(db: D1Database, statements: D1PreparedStatement[], chunkSize = 80) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

export type SocietyImportResult = {
  ok: true;
  spaceId: string;
  spaceName: string;
  membersCreated: number;
  paymentsPosted: number;
  expensesPosted: number;
  holdingsPosted: number;
  openingPosted: boolean;
  unmatchedPayments: string[];
};

export async function applySocietyImportPack(
  db: D1Database,
  user: RequestUser,
  pack: SocietyImportPack,
): Promise<SocietyImportResult> {
  const createdAt = new Date().toISOString();
  const currency = (pack.currency || "OMR").toUpperCase();
  const type = pack.type === "group" ? "group" : "society";
  const monthlyMinor = moneyMajor(pack.monthlyContribution, currency);
  const durationMonths = Math.min(120, Math.max(1, Number(pack.durationMonths ?? 12) || 12));
  const startsAt = toIsoDate(pack.startsAt, createdAt);
  const dueDay = Math.min(28, Math.max(1, Number(pack.dueDay ?? 1) || 1));

  const { getActivePlanEntitlements, planAllowsSpaceType } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, user.id);
  if (!planAllowsSpaceType(entitlements.features, type)) {
    throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  }

  const platformRole = await platformRoleOf(db, user.id);
  const isPlatformAdmin = ["super_admin", "admin"].includes(platformRole);
  const memberLimit = isPlatformAdmin
    ? Math.max(entitlements.memberLimit, 200)
    : entitlements.memberLimit;
  if (pack.members.length > memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");

  let spaceId = pack.spaceId?.trim() || "";
  let spaceName = pack.spaceName;
  if (spaceId) {
    await authorizeSpace(db, user, spaceId, "members:write", ["society", "group"]);
    const existing = await db.prepare("SELECT id,name_ar,type,currency FROM spaces WHERE id=?")
      .bind(spaceId)
      .first<{ id: string; name_ar: string; type: string; currency: string }>();
    if (!existing) throw new ApiError(404, "SPACE_NOT_FOUND");
    spaceName = existing.name_ar || spaceName;
  } else {
    const owned = await db.prepare("SELECT type FROM spaces WHERE owner_user_id=? AND COALESCE(status,'active') <> 'archived'")
      .bind(user.id).all<{ type: string }>();
    const count = filterSpacesByPlan(owned.results ?? [], entitlements.features).length;
    if (count >= entitlements.walletLimit) throw new ApiError(403, "PLAN_WALLET_LIMIT");

    spaceId = `${cleanId(user.id)}-${crypto.randomUUID()}`;
    const goalMinor = monthlyMinor > 0 ? multiplyMinor(monthlyMinor, durationMonths) * pack.members.length : 0;
    const tenantId = await ensureDefaultTenant(db, user);
    const boot: D1PreparedStatement[] = [
      db.prepare(
        "INSERT INTO spaces (id,owner_user_id,name_ar,name_en,type,currency,balance_minor,goal_minor,accent,created_at,starts_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'emerald', ?, ?)",
      ).bind(spaceId, user.id, pack.spaceName, pack.spaceName, type, currency, goalMinor, createdAt, startsAt),
      db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,'space',?,?)")
        .bind(tenantId, spaceId, createdAt),
      db.prepare("INSERT INTO accounting_periods (id,space_id,label,starts_at,status,created_at) VALUES (?,?,?,?,'open',?)")
        .bind(crypto.randomUUID(), spaceId, pack.spaceName, startsAt, createdAt),
      prepareAudit(db, {
        userId: user.id,
        action: "wallet.created",
        entityType: "space",
        entityId: spaceId,
        metadata: { type, currency, startsAt, via: "society.import" },
        createdAt,
      }),
    ];
    if (monthlyMinor > 0) {
      boot.push(
        db.prepare(
          `INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
           VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)`,
        ).bind(`${spaceId}-plan`, spaceId, monthlyMinor, dueDay, durationMonths, startsAt),
      );
    }
    await db.batch(boot);
  }

  const plan = await db.prepare("SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
    .bind(spaceId)
    .first<{ amount_minor: number; duration_months: number; starts_at: string }>();
  const planForMember = {
    amount_minor: Number(plan?.amount_minor ?? monthlyMinor),
    duration_months: Number(plan?.duration_months ?? durationMonths),
    starts_at: plan?.starts_at || startsAt,
  };
  const dueMinor = multiplyMinor(planForMember.amount_minor, planForMember.duration_months);

  const byName = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const paidByMember = new Map<string, number>();
  const dueByMember = new Map<string, number>();

  const existingMembers = await db.prepare(
    "SELECT id,display_name,phone,due_minor,paid_minor FROM members WHERE space_id=? AND status='active'",
  ).bind(spaceId).all<{ id: string; display_name: string; phone: string | null; due_minor: number; paid_minor: number }>();
  for (const row of existingMembers.results ?? []) {
    byName.set(normalizePersonKey(row.display_name), row.id);
    indexPhone(byPhone, row.phone, row.id);
    paidByMember.set(row.id, Number(row.paid_minor) || 0);
    dueByMember.set(row.id, Number(row.due_minor) || 0);
  }

  let existingCount = existingMembers.results?.length ?? 0;
  const memberStatements: D1PreparedStatement[] = [];
  let membersCreated = 0;

  for (const member of pack.members) {
    const phoneRaw = member.phone?.trim() || "";
    const phone = phoneRaw && isLikelyPhone(phoneRaw) ? (toWhatsAppNumber(phoneRaw) || phoneRaw) : (phoneRaw || null);
    const email = member.email?.includes("@") ? member.email : null;
    const joinedAt = toIsoDate(member.joinedAt, startsAt);

    const existingId = resolveMemberId(byName, byPhone, member.displayName, phone || undefined);
    if (existingId) {
      byName.set(normalizePersonKey(member.displayName), existingId);
      indexPhone(byPhone, phone, existingId);
      continue;
    }
    if (existingCount + membersCreated >= memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");

    const memberId = crypto.randomUUID();
    memberStatements.push(
      db.prepare(
        "INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,NULL,?,?,?,'member','active',?,0,0,'#0f766e',?)",
      ).bind(memberId, spaceId, member.displayName, email, phone, dueMinor, joinedAt),
    );
    byName.set(normalizePersonKey(member.displayName), memberId);
    indexPhone(byPhone, phone, memberId);
    paidByMember.set(memberId, 0);
    dueByMember.set(memberId, dueMinor);
    membersCreated += 1;
  }

  if (memberStatements.length) {
    memberStatements.push(prepareAudit(db, {
      userId: user.id,
      action: "member.created",
      entityType: "space",
      entityId: spaceId,
      metadata: { spaceId, via: "society.import", count: membersCreated },
      createdAt,
    }));
    await flushBatches(db, memberStatements);
  }

  await db.prepare(
    `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
  ).bind(spaceId, spaceId).run();

  const ledgerStatements: D1PreparedStatement[] = [];
  let balanceDelta = 0;
  let openingPosted = false;

  if (pack.openingBalance && Number(pack.openingBalance.amount) > 0) {
    const amountMinor = moneyMajor(pack.openingBalance.amount, currency);
    if (amountMinor > 0) {
      // Keep the Excel date (e.g. 2026-06-04) — booked as general income, not a member contribution.
      const occurredAt = toIsoDate(pack.openingBalance.date, startsAt);
      const note = pack.openingBalance.note?.trim();
      const description = (
        note
          ? (note.includes("مبالغ أخرى") || note.includes("افتتاح") ? note : `مبالغ أخرى — رصيد افتتاحي · ${note}`)
          : "مبالغ أخرى — رصيد افتتاحي (الجمعية السابقة)"
      ).slice(0, 300);
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      ledgerStatements.push(
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, spaceId, user.id, "income", "general", amountMinor, description, description, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, spaceId, transactionId, user.id, description, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "asset:cash", null, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "income:general", null, 0, amountMinor, createdAt),
      );
      balanceDelta += amountMinor;
      openingPosted = true;
    }
  }

  const unmatchedPayments: string[] = [];
  let paymentsPosted = 0;
  for (const payment of pack.payments ?? []) {
    const amountText = String(payment.amount ?? "").trim().replace(/,/g, "");
    if (!amountText || Number(amountText) <= 0) continue;
    if (looksLikeOpeningRow(payment.memberName, payment.note)) continue;

    let amountMinor: number;
    try {
      amountMinor = parseMoneyToMinor(amountText, currency);
    } catch {
      unmatchedPayments.push(payment.memberName);
      continue;
    }

    const memberId = resolveMemberId(byName, byPhone, payment.memberName, payment.phone);
    if (!memberId) {
      unmatchedPayments.push(payment.memberName);
      continue;
    }

    const paidSoFar = paidByMember.get(memberId) ?? 0;
    const due = dueByMember.get(memberId) ?? dueMinor;
    const remainingDueMinor = Math.max(0, due - paidSoFar);
    let split;
    try {
      split = splitContributionPayment(amountMinor, planForMember.amount_minor || remainingDueMinor || amountMinor, {
        remainingDueMinor,
        extraPolicy: "advance_credit",
      });
    } catch {
      unmatchedPayments.push(payment.memberName);
      continue;
    }

    const occurredAt = toIsoDate(payment.date, createdAt);
    const description = (payment.note || `مساهمة ${payment.memberName}`).slice(0, 300);
    let applied = 0;

    if (split.mandatoryMinor > 0) {
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const lineDescription = `${description} · سداد مطالبة`;
      ledgerStatements.push(
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, spaceId, user.id, memberId, "contribution", "mandatory", split.mandatoryMinor, lineDescription, lineDescription, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, spaceId, transactionId, user.id, lineDescription, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "asset:cash", memberId, split.mandatoryMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "income:contribution", memberId, 0, split.mandatoryMinor, createdAt),
      );
      balanceDelta += split.mandatoryMinor;
      applied += split.mandatoryMinor;
    }
    if (split.surplusMinor > 0) {
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const lineDescription = `${description} · مقدّم`;
      ledgerStatements.push(
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, spaceId, user.id, memberId, "contribution", "advance", split.surplusMinor, lineDescription, lineDescription, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, spaceId, transactionId, user.id, lineDescription, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "asset:cash", memberId, split.surplusMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "liability:advance", memberId, 0, split.surplusMinor, createdAt),
      );
      balanceDelta += split.surplusMinor;
      applied += split.surplusMinor;
    }

    if (applied > 0) {
      paidByMember.set(memberId, paidSoFar + applied);
      paymentsPosted += 1;
    }
  }

  let expensesPosted = 0;
  for (const expense of pack.expenses ?? []) {
    const amountText = String(expense.amount ?? "").trim().replace(/,/g, "");
    if (!amountText || Number(amountText) <= 0) continue;
    let amountMinor: number;
    try {
      amountMinor = parseMoneyToMinor(amountText, currency);
    } catch {
      continue;
    }
    const occurredAt = toIsoDate(expense.date, createdAt);
    const description = `${expense.description}${expense.beneficiary ? ` · ${expense.beneficiary}` : ""}`.slice(0, 300);
    const transactionId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    ledgerStatements.push(
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?)")
        .bind(transactionId, spaceId, user.id, "expense", "general", amountMinor, description, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, spaceId, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "expense:general", null, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", null, 0, amountMinor, createdAt),
    );
    balanceDelta -= amountMinor;
    expensesPosted += 1;
  }

  let holdingsPosted = 0;
  const holdingStatements: D1PreparedStatement[] = [];
  for (const holding of pack.holdings ?? []) {
    const amountText = String(holding.amount ?? "").trim().replace(/,/g, "");
    if (!amountText || Number(amountText) <= 0) continue;
    let amountMinor: number;
    try {
      amountMinor = parseMoneyToMinor(amountText, currency);
    } catch {
      continue;
    }
    const occurredAt = toIsoDate(holding.date, createdAt);
    const kind = normalizeHoldingKind(holding.kind);
    const name = holding.name.slice(0, 120);
    const notes = (holding.note || "").slice(0, 300) || null;
    let expectedReturnMinor = 0;
    if (holding.expectedReturn !== undefined && holding.expectedReturn !== "") {
      try {
        expectedReturnMinor = parseNonNegativeMoneyToMinor(holding.expectedReturn, currency);
      } catch {
        expectedReturnMinor = 0;
      }
    }
    let maturesAt: string | null = holding.maturesAt ? toIsoDate(holding.maturesAt, occurredAt) : null;
    if (!maturesAt) {
      const months = Number(holding.durationMonths);
      if (Number.isFinite(months) && months > 0 && months <= 120) {
        maturesAt = addMonthsIso(occurredAt, months);
      } else {
        const inferred = inferHoldingDurationMonths(name);
        if (inferred) maturesAt = addMonthsIso(occurredAt, inferred);
      }
    }
    const holdingId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const description = `تحويل إلى ${kind === "investment" ? "استثمار" : "وديعة"}: ${name}`.slice(0, 300);
    holdingStatements.push(
      db.prepare(
        "INSERT INTO space_holdings (id,space_id,name,kind,amount_minor,notes,acquired_at,matures_at,expected_return_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'active',?)",
      ).bind(holdingId, spaceId, name, kind, amountMinor, notes, occurredAt, maturesAt, expectedReturnMinor, createdAt),
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?)")
        .bind(transactionId, spaceId, user.id, "transfer", "holding", amountMinor, description, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, spaceId, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, kind === "investment" ? "asset:investment" : "asset:deposit", null, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", null, 0, amountMinor, createdAt),
    );
    balanceDelta -= amountMinor;
    holdingsPosted += 1;
  }

  if (ledgerStatements.length) {
    await flushBatches(db, ledgerStatements);
  }
  if (holdingStatements.length) {
    await flushBatches(db, holdingStatements);
  }

  const paidUpdates: D1PreparedStatement[] = [];
  for (const [memberId, paidMinor] of paidByMember) {
    // Only touch members we created or that received payments in this import.
    paidUpdates.push(
      db.prepare("UPDATE members SET paid_minor=? WHERE id=? AND space_id=?")
        .bind(paidMinor, memberId, spaceId),
    );
  }
  if (balanceDelta !== 0) {
    paidUpdates.push(
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?")
        .bind(balanceDelta, spaceId),
    );
  }
  if (paidUpdates.length) await flushBatches(db, paidUpdates);

  // Build installment schedules once from final paid totals (avoids per-payment DB work).
  if (planForMember.amount_minor > 0) {
    const installmentStatements: D1PreparedStatement[] = [];
    for (const [memberId, paidMinor] of paidByMember) {
      installmentStatements.push(
        db.prepare("DELETE FROM member_installments WHERE member_id=?").bind(memberId),
      );
      installmentStatements.push(
        ...await installmentInsertStatements(
          db,
          { id: memberId, space_id: spaceId, paid_minor: paidMinor },
          planForMember,
          createdAt,
        ),
      );
    }
    if (installmentStatements.length) await flushBatches(db, installmentStatements);
  }

  await reconcileMemberLedgers(db, [spaceId]);
  await writeApprovedCashBalance(db, spaceId);

  return {
    ok: true,
    spaceId,
    spaceName,
    membersCreated,
    paymentsPosted,
    expensesPosted,
    holdingsPosted,
    openingPosted,
    unmatchedPayments: unmatchedPayments.slice(0, 20),
  };
}
