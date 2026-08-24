/** Business API v1 — personal income/expense rules. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "./money";
import { dueAtForPeriod, monthKeysForRule } from "./personal-finance";
import { ApiError } from "./security";

type PersonalRuleRow = {
  id: string;
  space_id: string;
  account_id: string | null;
  kind: string;
  name: string;
  amount_mode: string;
  schedule?: string;
  amount_minor: number;
  due_day: number;
  starts_at: string;
  ends_at: string | null;
  total_minor: number;
  duration_months: number;
  paid_minor: number;
  status: string;
  created_at?: string;
};

function parseStartDate(value?: string) {
  if (!value) return new Date().toISOString();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_START_DATE");
  return date.toISOString();
}

export async function generateV1PersonalOccurrences(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  const [rules, existing] = await Promise.all([
    db.prepare(`SELECT * FROM personal_rules WHERE space_id IN (${placeholders}) AND status='active'`)
      .bind(...spaceIds).all<PersonalRuleRow>(),
    db.prepare(`SELECT rule_id, period_key FROM personal_occurrences WHERE space_id IN (${placeholders})`)
      .bind(...spaceIds).all<{ rule_id: string; period_key: string }>(),
  ]);
  const seen = new Set((existing.results ?? []).map((row) => `${row.rule_id}:${row.period_key}`));
  const createdAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const rule of rules.results ?? []) {
    if ((rule.schedule || "monthly") === "unscheduled") continue;
    for (const periodKey of monthKeysForRule({
      startsAt: rule.starts_at,
      endsAt: rule.ends_at,
      schedule: rule.schedule,
    })) {
      if (seen.has(`${rule.id}:${periodKey}`)) continue;
      statements.push(
        db.prepare(
          "INSERT OR IGNORE INTO personal_occurrences (id,rule_id,space_id,account_id,period_key,due_at,expected_minor,actual_minor,status,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,NULL,'pending',NULL,?)",
        ).bind(
          crypto.randomUUID(),
          rule.id,
          rule.space_id,
          rule.account_id,
          periodKey,
          dueAtForPeriod(periodKey, Number(rule.due_day)),
          Number(rule.amount_minor),
          createdAt,
        ),
      );
    }
  }
  if (statements.length) await db.batch(statements);
}

function mapRule(row: PersonalRuleRow) {
  return {
    id: row.id,
    spaceId: row.space_id,
    accountId: row.account_id,
    kind: row.kind,
    name: row.name,
    amountMode: row.amount_mode,
    schedule: row.schedule || "monthly",
    amountMinor: Number(row.amount_minor) || 0,
    dueDay: Number(row.due_day) || 1,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    totalMinor: Number(row.total_minor) || 0,
    durationMonths: Number(row.duration_months) || 0,
    paidMinor: Number(row.paid_minor) || 0,
    status: row.status,
    createdAt: row.created_at ?? null,
  };
}

export async function listV1PersonalRules(db: D1Database, spaceId: string) {
  await generateV1PersonalOccurrences(db, [spaceId]);
  const [rules, occurrences] = await Promise.all([
    db.prepare(`
      SELECT id,space_id,account_id,kind,name,amount_mode,schedule,amount_minor,due_day,starts_at,ends_at,total_minor,duration_months,paid_minor,status,created_at
      FROM personal_rules WHERE space_id=? ORDER BY created_at DESC
    `).bind(spaceId).all<PersonalRuleRow>(),
    db.prepare(`
      SELECT id,rule_id,space_id,account_id,period_key,due_at,expected_minor,actual_minor,status,transaction_id,created_at
      FROM personal_occurrences WHERE space_id=? AND status='pending'
      ORDER BY due_at ASC LIMIT 100
    `).bind(spaceId).all<{
      id: string; rule_id: string; space_id: string; account_id: string | null;
      period_key: string; due_at: string; expected_minor: number; actual_minor: number | null;
      status: string; transaction_id: string | null; created_at: string;
    }>(),
  ]);
  return {
    rules: (rules.results ?? []).map(mapRule),
    occurrences: (occurrences.results ?? []).map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      spaceId: row.space_id,
      accountId: row.account_id,
      periodKey: row.period_key,
      dueAt: row.due_at,
      expectedMinor: Number(row.expected_minor) || 0,
      actualMinor: row.actual_minor == null ? null : Number(row.actual_minor),
      status: row.status,
      transactionId: row.transaction_id,
      createdAt: row.created_at,
    })),
  };
}

export async function createV1PersonalRule(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  input: {
    accountId?: string | null;
    kind: "income" | "expense";
    name: string;
    amountMode?: "fixed" | "variable";
    schedule?: "monthly" | "once" | "unscheduled";
    amount?: string | number;
    dueDay?: number;
    startsAt: string;
    endsAt?: string;
    total?: string | number;
    durationMonths?: number;
  },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "INVALID_RULE");
  const amountMode = input.amountMode ?? "fixed";
  const schedule = input.schedule ?? "monthly";
  let amountMinor = 0;
  let totalMinor = 0;
  try {
    if (input.amount !== undefined && input.amount !== "") {
      amountMinor = parseMoneyToMinor(input.amount, space.currency);
    }
    if (input.total !== undefined && input.total !== "") {
      totalMinor = parseNonNegativeMoneyToMinor(input.total, space.currency);
    }
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  const duration = input.durationMonths ?? 0;
  if (totalMinor > 0 && duration > 0 && amountMinor <= 0) {
    amountMinor = Math.round(totalMinor / duration);
  }
  if (schedule !== "unscheduled" && amountMode === "fixed" && amountMinor <= 0) {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (schedule === "unscheduled" && amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  if (input.accountId) {
    const account = await db.prepare(
      "SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'",
    ).bind(input.accountId, space.id).first();
    if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
  }

  const startsAt = parseStartDate(input.startsAt);
  const endsAt = schedule === "once" ? startsAt : (input.endsAt ? parseStartDate(input.endsAt) : null);
  const dueDay = Math.min(28, Math.max(1, input.dueDay ?? 1));
  const createdAt = new Date().toISOString();
  const ruleId = crypto.randomUUID();

  await db.batch([
    db.prepare(
      "INSERT INTO personal_rules (id,space_id,account_id,kind,name,amount_mode,schedule,amount_minor,due_day,starts_at,ends_at,total_minor,duration_months,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'active',?)",
    ).bind(
      ruleId,
      space.id,
      input.accountId ?? null,
      input.kind,
      name,
      amountMode,
      schedule,
      amountMinor,
      dueDay,
      startsAt,
      endsAt,
      totalMinor,
      duration,
      createdAt,
    ),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.rule_added",
      entityType: "personal_rule",
      entityId: ruleId,
      metadata: { name, kind: input.kind, via: "api.v1" },
      createdAt,
    }),
  ]);
  await generateV1PersonalOccurrences(db, [space.id]);

  return mapRule({
    id: ruleId,
    space_id: space.id,
    account_id: input.accountId ?? null,
    kind: input.kind,
    name,
    amount_mode: amountMode,
    schedule,
    amount_minor: amountMinor,
    due_day: dueDay,
    starts_at: startsAt,
    ends_at: endsAt,
    total_minor: totalMinor,
    duration_months: duration,
    paid_minor: 0,
    status: "active",
    created_at: createdAt,
  });
}
