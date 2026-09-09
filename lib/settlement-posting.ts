/** Post a member-to-member settlement as a real transfer: from, to, why, how. */

import { prepareAudit } from "./audit";

export function peerSettlementNarration(input: {
  fromName: string;
  toName: string;
  reasonAr: string;
  reasonEn: string;
}) {
  const howAr = "تحويل مباشر بين الأعضاء (نقد أو تحويل شخصي)";
  const howEn = "direct member-to-member transfer (cash or personal transfer)";
  return {
    reasonAr: input.reasonAr,
    reasonEn: input.reasonEn,
    howAr,
    howEn,
    fromAr: `تحويل مسجّل: من ${input.fromName} إلى ${input.toName} · السبب: ${input.reasonAr} · كيف: ${howAr}`,
    fromEn: `Posted transfer: ${input.fromName} → ${input.toName} · why: ${input.reasonEn} · how: ${howEn}`,
    toAr: `استلام تحويل: من ${input.fromName} إلى ${input.toName} · السبب: ${input.reasonAr} · كيف: ${howAr}`,
    toEn: `Transfer received: ${input.fromName} → ${input.toName} · why: ${input.reasonEn} · how: ${howEn}`,
    journalAr: `تسوية: ${input.fromName} دفع إلى ${input.toName} (${input.reasonAr})`,
  };
}

export function peerSettlementReason(expenseDescription?: string | null) {
  const trimmed = String(expenseDescription || "").trim();
  if (trimmed) {
    return { reasonAr: `حصة مصروف «${trimmed}»`, reasonEn: `share of “${trimmed}”` };
  }
  return { reasonAr: "صافي مصروفات الرحلة بين الأعضاء", reasonEn: "netted trip expenses among members" };
}

export function memberRemainingSettlementOwe(
  memberId: string,
  settlements: Array<{ from_member_id: string; to_member_id?: string; amount_minor?: unknown; status?: string }>,
) {
  let total = 0;
  for (const row of settlements) {
    if ((row.status ?? "pending") !== "pending") continue;
    if (row.from_member_id !== memberId) continue;
    if (String(row.from_member_id).startsWith("space:")) continue;
    total += Math.max(0, Math.round(Number(row.amount_minor) || 0));
  }
  return total;
}

export async function postPeerMemberSettlement(
  db: D1Database,
  input: {
    userId: string;
    settlement: {
      id: string;
      space_id: string;
      from_member_id: string;
      to_member_id: string;
      amount_minor: number;
      expense_id?: string | null;
    };
    createdAt: string;
    via?: string;
  },
) {
  const amountMinor = Math.round(Number(input.settlement.amount_minor) || 0);
  if (amountMinor <= 0) throw new Error("INVALID_SETTLEMENT_AMOUNT");
  const names = await db.prepare("SELECT id,display_name FROM members WHERE id IN (?,?)")
    .bind(input.settlement.from_member_id, input.settlement.to_member_id)
    .all<{ id: string; display_name: string }>();
  const fromName = names.results?.find((row) => row.id === input.settlement.from_member_id)?.display_name ?? "عضو";
  const toName = names.results?.find((row) => row.id === input.settlement.to_member_id)?.display_name ?? "عضو";
  const expense = input.settlement.expense_id
    ? await db.prepare("SELECT description FROM trip_expenses WHERE id=?").bind(input.settlement.expense_id).first<{ description: string }>()
    : null;
  const reason = peerSettlementReason(expense?.description);
  const copy = peerSettlementNarration({ fromName, toName, ...reason });
  const fromTxn = crypto.randomUUID();
  const toTxn = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'")
      .bind(input.createdAt, input.settlement.id),
    db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
      .bind(fromTxn, input.settlement.space_id, input.userId, input.settlement.from_member_id, "reimbursement", amountMinor, copy.fromAr, copy.fromEn, input.createdAt, input.createdAt),
    db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
      .bind(toTxn, input.settlement.space_id, input.userId, input.settlement.to_member_id, "income", amountMinor, copy.toAr, copy.toEn, input.createdAt, input.createdAt),
    db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
      .bind(entryId, input.settlement.space_id, fromTxn, input.userId, copy.journalAr, input.createdAt, input.createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "liability:member_due", input.settlement.from_member_id, amountMinor, 0, input.createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "liability:member_payable", input.settlement.to_member_id, 0, amountMinor, input.createdAt),
    prepareAudit(db, {
      userId: input.userId,
      action: "member.settlement_recorded",
      entityType: "settlement",
      entityId: input.settlement.id,
      metadata: {
        fromMemberId: input.settlement.from_member_id,
        toMemberId: input.settlement.to_member_id,
        amountMinor,
        reasonAr: copy.reasonAr,
        howAr: copy.howAr,
        fromTxn,
        toTxn,
        via: input.via ?? "dashboard",
      },
      createdAt: input.createdAt,
    }),
  ]);
  return { fromTxn, toTxn, copy, amountMinor };
}
