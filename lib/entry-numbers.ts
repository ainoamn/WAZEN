/**
 * Sequential entry numbers per wallet (#1, #2, …) in the order entries were recorded.
 * Transactions and trip bills share one counter; a bill linked to a transaction reuses that number.
 * Numbers are filled lazily and never change once assigned.
 */

export type UnnumberedEntry = { id: string; created_at: string };
export type UnnumberedExpense = UnnumberedEntry & { linked: boolean };

export function planEntryNumbers(input: {
  maxSeq: number;
  transactions: UnnumberedEntry[];
  expenses: UnnumberedExpense[];
}) {
  const queue = [
    ...input.transactions.map((row) => ({ ...row, table: "transactions" as const })),
    ...input.expenses.filter((row) => !row.linked).map((row) => ({ ...row, table: "trip_expenses" as const })),
  ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.table === b.table ? 0 : a.table === "transactions" ? -1 : 1) || a.id.localeCompare(b.id));
  let next = Math.max(0, Math.floor(Number(input.maxSeq) || 0));
  return queue.map((row) => ({ table: row.table, id: row.id, seq: (next += 1) }));
}

const CHUNK = 80;

export async function assignEntryNumbers(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  const pending = await db.prepare(`SELECT space_id FROM transactions WHERE space_id IN (${placeholders}) AND seq_no IS NULL
      UNION SELECT space_id FROM trip_expenses WHERE space_id IN (${placeholders}) AND seq_no IS NULL`)
    .bind(...spaceIds, ...spaceIds)
    .all<{ space_id: string }>();
  for (const { space_id: spaceId } of pending.results ?? []) {
    const [maxTxn, maxExpense, transactions, expenses] = await Promise.all([
      db.prepare("SELECT COALESCE(MAX(seq_no),0) AS m FROM transactions WHERE space_id=?").bind(spaceId).first<{ m: number }>(),
      db.prepare("SELECT COALESCE(MAX(seq_no),0) AS m FROM trip_expenses WHERE space_id=?").bind(spaceId).first<{ m: number }>(),
      db.prepare("SELECT id, created_at FROM transactions WHERE space_id=? AND seq_no IS NULL").bind(spaceId).all<UnnumberedEntry>(),
      db.prepare(`SELECT te.id, te.created_at, CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS linked
        FROM trip_expenses te LEFT JOIN transactions t ON t.id=te.transaction_id
        WHERE te.space_id=? AND te.seq_no IS NULL`).bind(spaceId).all<{ id: string; created_at: string; linked: number }>(),
    ]);
    const plan = planEntryNumbers({
      maxSeq: Math.max(Number(maxTxn?.m ?? 0), Number(maxExpense?.m ?? 0)),
      transactions: transactions.results ?? [],
      expenses: (expenses.results ?? []).map((row) => ({ id: row.id, created_at: row.created_at, linked: Number(row.linked) === 1 })),
    });
    const statements = plan.map((row) => db.prepare(`UPDATE ${row.table} SET seq_no=? WHERE id=? AND seq_no IS NULL`).bind(row.seq, row.id));
    statements.push(db.prepare(`UPDATE trip_expenses SET seq_no=(SELECT t.seq_no FROM transactions t WHERE t.id=trip_expenses.transaction_id)
      WHERE space_id=? AND seq_no IS NULL AND transaction_id IS NOT NULL`).bind(spaceId));
    for (let index = 0; index < statements.length; index += CHUNK) {
      await db.batch(statements.slice(index, index + CHUNK));
    }
  }
}
