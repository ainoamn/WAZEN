import assert from "node:assert/strict";
import test from "node:test";
import { buildMemberLedger, buildMemberLedgerHtml, filterMemberLedgerLines } from "../lib/member-ledger.ts";

const member = {
  id: "m1",
  space_id: "s1",
  display_name: "ماجد",
  due_minor: 240_000,
  paid_minor: 50_000,
  extra_minor: 0,
  addon_minor: 10_000,
  joined_at: "2026-01-10T00:00:00.000Z",
};

test("member ledger splits a payment across oldest months and explains leftover credit", () => {
  const ledger = buildMemberLedger({
    member,
    spaceNameAr: "جمعية",
    spaceNameEn: "Circle",
    currency: "OMR",
    plan: { amount_minor: 20_000, duration_months: 12, starts_at: "2026-01-01T00:00:00.000Z" },
    installments: [],
    transactions: [{
      id: "t1",
      space_id: "s1",
      member_id: "m1",
      kind: "contribution",
      allocation: "common_fund",
      amount_minor: 50_000,
      description_ar: "دفعة يناير",
      description_en: "January payment",
      status: "approved",
      occurred_at: "2026-01-12T10:00:00.000Z",
    }],
    settlements: [],
    tripExpenses: [],
    expenseSplits: [],
  });
  const paid = filterMemberLedgerLines(ledger.lines, "paid");
  assert.equal(paid.length >= 1, true);
  assert.match(paid[0].detailAr, /شهر 1/);
  assert.match(paid[0].detailAr, /شهر 2/);
  assert.equal(ledger.paidMinor, 50_000);
});

test("pending settlement from member appears under owes with the other party", () => {
  const ledger = buildMemberLedger({
    member: { ...member, paid_minor: 240_000, addon_minor: 0 },
    spaceNameAr: "سفر",
    spaceNameEn: "Trip",
    currency: "OMR",
    installments: [],
    transactions: [],
    settlements: [{
      id: "st1",
      space_id: "s1",
      from_member_id: "m1",
      to_member_id: "m2",
      from_member_name: "ماجد",
      to_member_name: "محمد",
      amount_minor: 15_000,
      status: "pending",
    }],
    tripExpenses: [],
    expenseSplits: [],
  });
  const owes = filterMemberLedgerLines(ledger.lines, "owes");
  assert.equal(owes.some((row) => row.detailAr.includes("محمد")), true);
  assert.equal(ledger.owesMinor, 15_000);
});

test("fund-paid expense share nets against paid → leftover under credit", () => {
  const ledger = buildMemberLedger({
    member: { ...member, paid_minor: 200_000, due_minor: 200_000, addon_minor: 0 },
    spaceNameAr: "سفر",
    spaceNameEn: "Trip",
    currency: "OMR",
    installments: [],
    transactions: [],
    settlements: [],
    tripExpenses: [{
      id: "e1",
      space_id: "s1",
      paid_by_member_id: "m0",
      paid_by_name: "صندوق الجمعية",
      amount_minor: 331_000,
      description: "تذاكر",
      occurred_at: "2026-08-30T12:00:00.000Z",
      paid_from: "common_fund",
    }],
    expenseSplits: [{ expense_id: "e1", member_id: "m1", share_minor: 165_500 }],
  });
  assert.equal(ledger.owesMinor, 0);
  assert.equal(ledger.creditMinor, 34_500);
  const spent = filterMemberLedgerLines(ledger.lines, "spent");
  assert.equal(spent.some((row) => row.titleAr.includes("حصة")), true);
  const credit = filterMemberLedgerLines(ledger.lines, "credit");
  assert.equal(credit.some((row) => row.titleAr.includes("متبقي")), true);
});

test("fund-paid share exceeding paid creates owes shortfall", () => {
  const ledger = buildMemberLedger({
    member: { ...member, paid_minor: 100_000, due_minor: 200_000, addon_minor: 0 },
    spaceNameAr: "سفر",
    spaceNameEn: "Trip",
    currency: "OMR",
    installments: [],
    transactions: [],
    settlements: [],
    tripExpenses: [{
      id: "e1",
      space_id: "s1",
      paid_by_member_id: "m0",
      paid_by_name: "صندوق الجمعية",
      amount_minor: 331_000,
      description: "تذاكر",
      occurred_at: "2026-08-30T12:00:00.000Z",
      paid_from: "common_fund",
    }],
    expenseSplits: [{ expense_id: "e1", member_id: "m1", share_minor: 165_500 }],
  });
  // remainingDue 100k + shortfall 65.5k = 165.5k, then netted? remainingDue = max(0, accrued-paid).
  // Without installment schedule, accrued = due_minor = 200k → remainingDue = 100k.
  // shortfall = 65.5k → gross debit 165.5k, credit 0.
  assert.equal(ledger.owesMinor, 165_500);
  assert.equal(ledger.creditMinor, 0);
});

test("fund deficit settlement does not double-count when shares already netted", () => {
  const ledger = buildMemberLedger({
    member: { ...member, paid_minor: 200_000, due_minor: 200_000, addon_minor: 0 },
    spaceNameAr: "سفر",
    spaceNameEn: "Trip",
    currency: "OMR",
    installments: [],
    transactions: [],
    settlements: [{
      id: "st-fund",
      space_id: "s1",
      from_member_id: "m1",
      to_member_id: "space:s1",
      from_member_name: "ماجد",
      to_member_name: "صندوق الجمعية",
      amount_minor: 40_000,
      status: "pending",
    }],
    tripExpenses: [{
      id: "e1",
      space_id: "s1",
      paid_by_member_id: "m0",
      paid_by_name: "صندوق الجمعية",
      amount_minor: 80_000,
      description: "مصروف",
      occurred_at: "2026-08-30T12:00:00.000Z",
      paid_from: "common_fund",
    }],
    expenseSplits: [{ expense_id: "e1", member_id: "m1", share_minor: 40_000 }],
  });
  // paid 200 − share 40 → له 160; fund deficit settlement ignored for debit
  assert.equal(ledger.owesMinor, 0);
  assert.equal(ledger.creditMinor, 160_000);
});

test("printable member html includes name and movements table", () => {
  const ledger = buildMemberLedger({
    member,
    spaceNameAr: "جمعية",
    spaceNameEn: "Circle",
    currency: "OMR",
    plan: { amount_minor: 20_000, duration_months: 12, starts_at: "2026-01-01T00:00:00.000Z" },
    installments: [],
    transactions: [],
    settlements: [],
    tripExpenses: [],
    expenseSplits: [],
  });
  const html = buildMemberLedgerHtml({
    locale: "ar",
    logoUrl: "/brand/wazen-lockup.png",
    issuerName: "أمين",
    memberName: "ماجد",
    spaceName: "جمعية",
    currency: "OMR",
    joinedAt: member.joined_at,
    focus: "all",
    ledger,
  });
  assert.match(html, /ماجد/);
  assert.match(html, /كشف العضو التفصيلي/);
  assert.match(html, /onclick="window.print\(\)"/);
});
