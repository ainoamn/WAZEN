import assert from "node:assert/strict";
import test from "node:test";
import { planEntryNumbers } from "../lib/entry-numbers.ts";

test("numbers continue after the wallet's highest number, in entry order", () => {
  const plan = planEntryNumbers({
    maxSeq: 7,
    transactions: [
      { id: "t2", created_at: "2026-09-02T10:00:00.000Z" },
      { id: "t1", created_at: "2026-09-01T10:00:00.000Z" },
    ],
    expenses: [
      { id: "e1", created_at: "2026-09-01T12:00:00.000Z", linked: false },
      { id: "e-linked", created_at: "2026-09-01T11:00:00.000Z", linked: true },
    ],
  });
  assert.deepEqual(plan, [
    { table: "transactions", id: "t1", seq: 8 },
    { table: "trip_expenses", id: "e1", seq: 9 },
    { table: "transactions", id: "t2", seq: 10 },
  ]);
});

test("a fresh wallet starts at 1 and linked bills take their transaction's number", () => {
  const plan = planEntryNumbers({
    maxSeq: 0,
    transactions: [{ id: "t", created_at: "2026-09-01T10:00:00.000Z" }],
    expenses: [{ id: "e", created_at: "2026-09-01T10:00:00.000Z", linked: true }],
  });
  assert.deepEqual(plan, [{ table: "transactions", id: "t", seq: 1 }]);
});
