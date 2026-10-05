import assert from "node:assert/strict";
import test from "node:test";
import { filterTripExpenses, normalizeSearchText } from "../lib/trip-expense-filter.ts";

const expenses = [
  { id: "a", description: "مواقف المطار", amount_minor: 1_681, occurred_at: "2026-09-02T10:00:00.000Z", paid_by_member_id: "ah", paid_by_name: "ABDUL HAMID", paid_from: "member" },
  { id: "b", description: "بترول", amount_minor: 12_500, occurred_at: "2026-09-05T10:00:00.000Z", paid_by_member_id: "ah", paid_by_name: "ABDUL HAMID", paid_from: "member" },
  { id: "c", description: "تذاكر", amount_minor: 691_809, occurred_at: "2026-08-30T10:00:00.000Z", paid_by_member_id: "", paid_by_name: "صندوق الجمعية", paid_from: "common_fund" },
  { id: "d", description: "عشاء", amount_minor: 10_088, occurred_at: "2026-09-18T10:00:00.000Z", paid_by_member_id: "majed", paid_by_name: "ماجد", paid_from: "member" },
];
const names = new Map([["d", ["dawood abdalluh", "ماجد"]]]);

test("normalizes Arabic digits, decimal comma and alef forms", () => {
  assert.equal(normalizeSearchText("١٢٫٥٠٠ ر.ع."), "12.500 ر.ع.");
  assert.equal(normalizeSearchText("١٬٦٨١"), "1681");
  assert.equal(normalizeSearchText("أحمد"), "احمد");
});

test("default sort is newest first", () => {
  assert.deepEqual(filterTripExpenses([...expenses], names, {}).map((row) => row.id), ["d", "b", "a", "c"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { sort: "oldest" }).map((row) => row.id), ["c", "a", "b", "d"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { sort: "amount_desc" }).map((row) => row.id), ["c", "b", "d", "a"]);
});

test("searches by amount in Arabic or Latin digits", () => {
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "١٢٫٥" }).map((row) => row.id), ["b"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "1.681" }).map((row) => row.id), ["a"]);
});

test("searches by date, description and member names", () => {
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "18/9/2026" }).map((row) => row.id), ["d"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "2026-09-05" }).map((row) => row.id), ["b"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "dawood" }).map((row) => row.id), ["d"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { query: "مواقف" }).map((row) => row.id), ["a"]);
});

test("sorts by entry number by default and finds «#n» exactly", () => {
  const numbered = expenses.map((row, index) => ({ ...row, seq_no: [3, 12, 1, 20][index] }));
  assert.deepEqual(filterTripExpenses([...numbered], names, {}).map((row) => row.seq_no), [20, 12, 3, 1]);
  assert.deepEqual(filterTripExpenses([...numbered], names, { sort: "number_asc" }).map((row) => row.seq_no), [1, 3, 12, 20]);
  assert.deepEqual(filterTripExpenses([...numbered], names, { query: "#12" }).map((row) => row.id), ["b"]);
  assert.deepEqual(filterTripExpenses([...numbered], names, { query: "#١" }).map((row) => row.id), ["c"]);
});

test("filters by payer and date range", () => {
  assert.deepEqual(filterTripExpenses([...expenses], names, { payer: "fund" }).map((row) => row.id), ["c"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { payer: "ah" }).map((row) => row.id), ["b", "a"]);
  assert.deepEqual(filterTripExpenses([...expenses], names, { from: "2026-09-01", to: "2026-09-10" }).map((row) => row.id), ["b", "a"]);
});
