import assert from "node:assert/strict";
import test from "node:test";
import { revisionChangeLines, snapshotFromTransaction } from "../lib/transaction-revisions.ts";

test("revisionChangeLines lists only fields that actually changed", () => {
  const before = snapshotFromTransaction({
    kind: "contribution",
    allocation: "mandatory",
    amount_minor: 20_000,
    member_id: "m1",
    description_ar: "دفعة قديمة",
    description_en: "Old payment",
    occurred_at: "2026-08-01T00:00:00.000Z",
    status: "approved",
  });
  const lines = revisionChangeLines(
    before,
    {
      description_ar: "دفعة جديدة",
      amount_minor: 25_000,
      occurred_at: "2026-08-23T00:00:00.000Z",
    },
    "ar",
    (minor) => String(minor),
    (id) => (id === "m1" ? "ماجد" : "—"),
  );
  assert.equal(lines.length, 3);
  assert.ok(lines.some((line) => line.label === "الوصف" && line.from === "دفعة قديمة" && line.to === "دفعة جديدة"));
  assert.ok(lines.some((line) => line.label === "المبلغ" && line.from === "20000" && line.to === "25000"));
  assert.ok(lines.some((line) => line.label === "التاريخ"));
});
