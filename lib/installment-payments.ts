/** Shared installment payment allocation for dashboard and Business API v1. */

import {
  allocateOldestFirst,
  buildInstallmentSchedule,
  installmentStatus,
  type InstallmentLike,
} from "./installments";

export type InstallmentRow = InstallmentLike & {
  member_id: string;
  space_id: string;
  due_at: string;
};

export async function installmentInsertStatements(
  db: D1Database,
  member: { id: string; space_id: string; paid_minor: number },
  plan: { amount_minor: number; duration_months: number; starts_at?: string } | null,
  createdAt: string,
) {
  if (!plan || Number(plan.amount_minor) <= 0) return [];
  const schedule = buildInstallmentSchedule({
    memberId: member.id,
    spaceId: member.space_id,
    startAt: plan.starts_at || createdAt,
    durationMonths: Number(plan.duration_months) || 12,
    amountMinor: Number(plan.amount_minor),
    paidMinor: Number(member.paid_minor),
  });
  return schedule.rows.map((row) =>
    db.prepare(
      "INSERT OR IGNORE INTO member_installments (id,member_id,space_id,period_index,period_key,due_at,amount_minor,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      row.id,
      member.id,
      member.space_id,
      row.period_index,
      row.period_key,
      row.due_at,
      row.amount_minor,
      row.paid_minor,
      row.status,
      createdAt,
    ),
  );
}

export async function paymentInstallmentStatements(
  db: D1Database,
  member: { id: string; space_id: string; paid_minor: number },
  plan: { amount_minor: number; duration_months: number; starts_at?: string } | null,
  paymentMinor: number,
  createdAt: string,
  selectedIds?: string[],
) {
  const existing = await db.prepare(
    "SELECT * FROM member_installments WHERE member_id=? ORDER BY period_index",
  ).bind(member.id).all<InstallmentRow>();
  const statements: D1PreparedStatement[] = [];
  let rows: InstallmentLike[] = existing.results ?? [];
  if (!rows.length) {
    statements.push(...await installmentInsertStatements(db, member, plan, createdAt));
    if (plan && Number(plan.amount_minor) > 0) {
      rows = buildInstallmentSchedule({
        memberId: member.id,
        spaceId: member.space_id,
        startAt: plan.starts_at || createdAt,
        durationMonths: Number(plan.duration_months) || 12,
        amountMinor: Number(plan.amount_minor),
        paidMinor: Number(member.paid_minor),
      }).rows;
    }
  }
  if (!rows.length) {
    return {
      statements,
      allocated: {
        allocations: [] as ReturnType<typeof allocateOldestFirst>["allocations"],
        appliedMinor: 0,
        leftoverMinor: paymentMinor,
      },
    };
  }
  const allocated = allocateOldestFirst(rows, paymentMinor, selectedIds);
  for (const item of allocated.allocations) {
    const row = rows.find((entry) => entry.id === item.installmentId);
    if (!row) continue;
    const paid = Number(row.paid_minor) + item.amountMinor;
    statements.push(
      db.prepare("UPDATE member_installments SET paid_minor=?, status=? WHERE id=?")
        .bind(paid, installmentStatus(Number(row.amount_minor), paid), item.installmentId),
    );
  }
  return { statements, allocated };
}
