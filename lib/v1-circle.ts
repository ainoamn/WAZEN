/** Business API v1 — society/group circle order and turns. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { formatMoneyMinor, multiplyMinor, parseMoneyToMinor } from "./money";
import { buildCircleOrder, type CircleMode } from "./finance";
import { writeApprovedCashBalance } from "./ledger-void";

export async function getV1Circle(db: D1Database, spaceId: string, options?: { limit?: number }) {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const config = await db.prepare(`
    SELECT space_id, ordering_mode, draw_seed_hash, current_turn, updated_by, updated_at
    FROM circle_configs WHERE space_id=?
  `).bind(spaceId).first<{
    space_id: string; ordering_mode: string; draw_seed_hash: string | null;
    current_turn: number; updated_by: string | null; updated_at: string | null;
  }>();
  const turns = await db.prepare(`
    SELECT ct.id, ct.member_id, ct.turn_number, ct.status, ct.amount_minor, ct.created_at, ct.paid_at, m.display_name
    FROM circle_turns ct JOIN members m ON m.id=ct.member_id
    WHERE ct.space_id=?
    ORDER BY ct.turn_number ASC LIMIT ?
  `).bind(spaceId, limit).all<{
    id: string; member_id: string; turn_number: number; status: string; amount_minor: number;
    created_at: string; paid_at: string | null; display_name: string;
  }>();

  return {
    spaceId,
    config: config
      ? {
        orderingMode: config.ordering_mode,
        drawSeedHash: config.draw_seed_hash,
        currentTurn: Number(config.current_turn) || 0,
        updatedBy: config.updated_by,
        updatedAt: config.updated_at,
      }
      : null,
    turns: (turns.results ?? []).map((turn) => ({
      id: turn.id,
      memberId: turn.member_id,
      memberName: turn.display_name,
      turnNumber: Number(turn.turn_number),
      status: turn.status,
      amountMinor: Number(turn.amount_minor) || 0,
      createdAt: turn.created_at,
      paidAt: turn.paid_at,
    })),
  };
}

export type V1SetCircleOrderInput = {
  mode: CircleMode;
  amount: string | number;
  monthlyContribution: string | number;
  durationMonths: number;
  dueDay: number;
  memberIds?: string[];
  previousRecipientId?: string;
  seed?: string;
};

export async function setV1CircleOrder(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  input: V1SetCircleOrderInput,
) {
  const rows = await db.prepare("SELECT id,display_name FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
    .bind(space.id).all<{ id: string; display_name: string }>();
  if (!rows.results?.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");

  let members = rows.results.map((member) => ({ id: member.id, name: member.display_name }));
  if (input.mode === "manual") {
    const requested = input.memberIds ?? [];
    if (
      requested.length !== members.length
      || new Set(requested).size !== members.length
      || members.some((member) => !requested.includes(member.id))
    ) {
      throw new ApiError(400, "INVALID_MANUAL_ORDER");
    }
    members = requested.map((memberId) => members.find((member) => member.id === memberId)!);
  }

  const ordered = await buildCircleOrder(members, input.mode, {
    seed: input.seed,
    previousRecipientId: input.previousRecipientId,
  });

  let amountMinor: number;
  let contributionMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
    contributionMinor = parseMoneyToMinor(input.monthlyContribution, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0 || contributionMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const durationMonths = Math.min(120, Math.max(1, Number(input.durationMonths) || 12));
  const dueDay = Math.min(28, Math.max(1, Number(input.dueDay) || 1));
  const totalDueMinor = multiplyMinor(contributionMinor, durationMonths);
  const createdAt = new Date().toISOString();
  const previous = await db.prepare("SELECT COALESCE(MAX(turn_number),0) AS last_turn FROM circle_turns WHERE space_id=? AND status='paid'")
    .bind(space.id).first<{ last_turn: number }>();
  const existingPlan = await db.prepare("SELECT id FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
    .bind(space.id).first<{ id: string }>();
  const turnBase = Number(previous?.last_turn ?? 0);

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM circle_turns WHERE space_id=? AND status='scheduled'").bind(space.id),
    db.prepare(`INSERT INTO circle_configs (space_id,ordering_mode,draw_seed_hash,current_turn,updated_by,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(space_id) DO UPDATE SET ordering_mode=excluded.ordering_mode,draw_seed_hash=excluded.draw_seed_hash,current_turn=excluded.current_turn,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(space.id, input.mode, ordered.seedHash, turnBase, user.id, createdAt),
    db.prepare(`INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at) VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)
      ON CONFLICT(id) DO UPDATE SET amount_minor=excluded.amount_minor,due_day=excluded.due_day,duration_months=excluded.duration_months`)
      .bind(existingPlan?.id ?? `${space.id}-plan`, space.id, contributionMinor, dueDay, durationMonths, createdAt),
    db.prepare("UPDATE members SET due_minor=? WHERE space_id=? AND status='active'").bind(totalDueMinor, space.id),
  ];
  for (const [index, member] of ordered.members.entries()) {
    statements.push(
      db.prepare(`INSERT INTO circle_turns
        (id,space_id,member_id,turn_number,status,amount_minor,created_at) VALUES (?,?,?,?,'scheduled',?,?)`)
        .bind(crypto.randomUUID(), space.id, member.id, turnBase + index + 1, amountMinor, createdAt),
    );
  }
  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "circle.order_set",
    entityType: "space",
    entityId: space.id,
    metadata: {
      mode: input.mode,
      members: ordered.members.map((member) => member.id),
      seedHash: ordered.seedHash,
      via: "api.v1",
    },
    createdAt,
  }));
  await db.batch(statements);

  return getV1Circle(db, space.id);
}

export async function completeV1CircleTurn(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; balance_minor: number; owner_user_id: string },
  turnId: string,
  options?: { idempotencyKey?: string },
) {
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  const turn = await db.prepare(`
    SELECT ct.id,ct.space_id,ct.member_id,ct.turn_number,ct.amount_minor,s.balance_minor,m.display_name
    FROM circle_turns ct JOIN spaces s ON s.id=ct.space_id JOIN members m ON m.id=ct.member_id
    WHERE ct.id=? AND ct.space_id=? AND ct.status='scheduled'
      AND ct.turn_number=(SELECT MIN(turn_number) FROM circle_turns WHERE space_id=ct.space_id AND status='scheduled')
  `).bind(turnId, space.id).first<{
    id: string; space_id: string; member_id: string; turn_number: number;
    amount_minor: number; balance_minor: number; display_name: string;
  }>();
  if (!turn) throw new ApiError(409, "TURN_NOT_CURRENT");

  const amountMinor = Number(turn.amount_minor) || 0;
  if (Number(turn.balance_minor) < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");

  const transactionId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const description = `Circle payout #${turn.turn_number} — ${turn.display_name}`;
  const claimKey = options?.idempotencyKey || `v1-circle-${turn.id}`;

  await db.batch([
    db.prepare("INSERT INTO financial_operation_claims (operation_type,resource_id,idempotency_key,created_at) VALUES ('circle_payout',?,?,?)")
      .bind(turn.id, claimKey, createdAt),
    db.prepare("UPDATE circle_turns SET status='paid',paid_at=? WHERE id=? AND status='scheduled'")
      .bind(createdAt, turn.id),
    db.prepare("UPDATE circle_configs SET current_turn=?,updated_by=?,updated_at=? WHERE space_id=?")
      .bind(turn.turn_number, user.id, createdAt, turn.space_id),
    db.prepare("UPDATE spaces SET balance_minor=balance_minor-? WHERE id=?")
      .bind(amountMinor, turn.space_id),
    db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
      .bind(transactionId, turn.space_id, user.id, turn.member_id, "expense", amountMinor, description, description, createdAt, createdAt),
    db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
      .bind(entryId, turn.space_id, transactionId, user.id, description, createdAt, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "expense:circle_payout", turn.member_id, amountMinor, 0, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "asset:cash", turn.member_id, 0, amountMinor, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "circle.turn_paid",
      entityType: "circle_turn",
      entityId: turn.id,
      metadata: { memberId: turn.member_id, amountMinor, via: "api.v1" },
      createdAt,
    }),
  ]);
  try { await writeApprovedCashBalance(db, turn.space_id); } catch { /* best-effort */ }

  return {
    id: turn.id,
    spaceId: turn.space_id,
    memberId: turn.member_id,
    turnNumber: turn.turn_number,
    amountMinor,
    amountLabel: formatMoneyMinor(amountMinor, space.currency || "OMR", "en"),
    status: "paid" as const,
    paidAt: createdAt,
    transactionId,
  };
}
