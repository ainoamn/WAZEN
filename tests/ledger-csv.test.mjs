import assert from "node:assert/strict";
import test from "node:test";
import {
  mapBankCsvRow,
  membersToCsv,
  parseBankCsv,
  toCsv,
  transactionsToCsv,
} from "../lib/ledger-csv.ts";

test("toCsv adds BOM and escapes quotes", () => {
  const csv = toCsv([["a", "b"], ['he said "hi"', "2"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"he said ""hi"""/);
});

test("transactions and members CSV include headers", () => {
  const tx = transactionsToCsv({
    locale: "ar",
    spaces: [{ id: "s1", name_ar: "جمعية", name_en: "Assoc" }],
    members: [{ id: "m1", display_name: "أحمد" }],
    transactions: [{
      id: "t1",
      space_id: "s1",
      member_id: "m1",
      kind: "contribution",
      amount_minor: 1000,
      description_ar: "دفعة",
      description_en: "Pay",
      occurred_at: "2026-08-01T00:00:00.000Z",
      status: "approved",
    }],
  });
  assert.match(tx, /التاريخ/);
  assert.match(tx, /جمعية/);
  assert.match(tx, /أحمد/);

  const members = membersToCsv({
    locale: "en",
    spaces: [{ id: "s1", name_ar: "جمعية", name_en: "Assoc" }],
    members: [{ id: "m1", space_id: "s1", display_name: "Ali", due_minor: 10, paid_minor: 5 }],
  });
  assert.match(members, /Wallet/);
  assert.match(members, /Ali/);
});

test("bank CSV parser maps amount and description", () => {
  const { rows } = parseBankCsv("Date,Amount,Description\n2026-08-01,12.500,Salary\n2026-08-02,-3.000,Fuel");
  assert.equal(rows.length, 2);
  const income = mapBankCsvRow(rows[0]);
  const expense = mapBankCsvRow(rows[1]);
  assert.equal(income.kind, "income");
  assert.equal(income.amountMajor, 12.5);
  assert.equal(expense.kind, "expense");
  assert.equal(expense.amountMajor, 3);
  assert.match(expense.description, /Fuel/);
});
