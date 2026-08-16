import assert from "node:assert/strict";
import test from "node:test";
import { applyCreditToDebits, buildCircleOrder, memberCashCreditMinor, minimizeSettlements, pendingSettlementsWithCredit, netMemberClaim, splitContributionPayment, splitEvenly, validateJournal } from "../lib/finance.ts";
import { coveringPeriod, isPeriodLocked } from "../lib/accounting-periods.ts";
import { bankCustodySplit } from "../lib/wallet-links.ts";

test("equal expense splits preserve every minor unit", () => {
  const splits = splitEvenly(100, ["a", "b", "c"]);
  assert.deepEqual(splits.map((item) => item.shareMinor), [34, 33, 33]);
  assert.equal(splits.reduce((sum, item) => sum + item.shareMinor, 0), 100);
  const three = splitEvenly(60_000, ["abdul", "mohamed", "majed"]);
  assert.deepEqual(three.map((item) => item.shareMinor), [20_000, 20_000, 20_000]);
});

test("contribution payment applies against full outstanding dues then advance", () => {
  // Remaining 240.000 OMR, receive 100.000 → all 100 against dues (not capped to monthly 20)
  const againstDues = splitContributionPayment(100_000, 20_000, { remainingDueMinor: 240_000 });
  assert.equal(againstDues.mandatoryMinor, 100_000);
  assert.equal(againstDues.surplusMinor, 0);
  assert.equal(againstDues.extraPolicy, "advance_credit");

  // No outstanding claims → full amount is advance (مقدم)
  const advanceOnly = splitContributionPayment(50_000, 20_000, { remainingDueMinor: 0 });
  assert.equal(advanceOnly.mandatoryMinor, 0);
  assert.equal(advanceOnly.surplusMinor, 50_000);
  assert.equal(advanceOnly.advanceCreditMinor, 50_000);
  assert.equal(advanceOnly.commonFundDeltaMinor, 50_000);

  // Remaining 40, receive 100 → 40 dues + 60 advance
  const mixed = splitContributionPayment(100_000, 20_000, { remainingDueMinor: 40_000 });
  assert.equal(mixed.mandatoryMinor, 40_000);
  assert.equal(mixed.surplusMinor, 60_000);
  assert.equal(mixed.advanceCreditMinor, 60_000);
});

test("contribution payment splits mandatory and protected surplus when explicitly requested", () => {
  // 20.00 plan (legacy monthly-only mode without remainingDue), receive 50.00 → 20 mandatory + 30 personal reserve
  const split = splitContributionPayment(5000, 2000, { extraPolicy: "personal_reserve" });
  assert.equal(split.mandatoryMinor, 2000);
  assert.equal(split.surplusMinor, 3000);
  assert.equal(split.commonFundDeltaMinor, 2000);
  assert.equal(split.personalReserveDeltaMinor, 3000);
  assert.equal(split.advanceCreditMinor, 0);
});

test("voluntary surplus joins the common fund", () => {
  const split = splitContributionPayment(5000, 2000, { extraPolicy: "voluntary_to_fund" });
  assert.equal(split.commonFundDeltaMinor, 5000);
  assert.equal(split.personalReserveDeltaMinor, 0);
});

test("journal validation rejects unbalanced entries", () => {
  assert.equal(validateJournal([{ debitMinor: 500, creditMinor: 0 }, { debitMinor: 0, creditMinor: 500 }]), true);
  assert.equal(validateJournal([{ debitMinor: 500, creditMinor: 0 }, { debitMinor: 0, creditMinor: 499 }]), false);
  assert.equal(validateJournal([{ debitMinor: 500, creditMinor: 500 }]), false);
});

test("settlement optimizer closes debtor and creditor balances", () => {
  assert.deepEqual(minimizeSettlements([
    { memberId: "payer", balanceMinor: 900 }, { memberId: "one", balanceMinor: -300 }, { memberId: "two", balanceMinor: -600 },
  ]), [
    { fromMemberId: "one", toMemberId: "payer", amountMinor: 300 },
    { fromMemberId: "two", toMemberId: "payer", amountMinor: 600 },
  ]);
});

test("electronic draw is deterministic and stores only a seed hash", async () => {
  const members = [{ id: "1", name: "أحمد" }, { id: "2", name: "سارة" }, { id: "3", name: "خالد" }];
  const first = await buildCircleOrder(members, "draw", { seed: "a-public-verifiable-seed" });
  const second = await buildCircleOrder(members, "draw", { seed: "a-public-verifiable-seed" });
  assert.deepEqual(first, second); assert.equal(first.seedHash?.length, 64); assert.notEqual(first.seedHash, "a-public-verifiable-seed");
});

test("hierarchical order moves the previous recipient to the end", async () => {
  const result = await buildCircleOrder([{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }], "hierarchical", { previousRecipientId: "1" });
  assert.deepEqual(result.members.map((member) => member.id), ["2", "3", "1"]);
});

test("closed accounting period locks dates inside its range until reopened", () => {
  const closed = { id: "p1", space_id: "s1", starts_at: "2026-01-01T00:00:00.000Z", ends_at: "2026-08-13T00:00:00.000Z", closed_at: "2026-08-13T00:00:00.000Z", status: "closed" };
  assert.equal(isPeriodLocked([closed], "2026-08-01T12:00:00.000Z"), true);
  assert.equal(isPeriodLocked([{ ...closed, status: "reopened" }], "2026-08-01T12:00:00.000Z"), false);
  assert.equal(coveringPeriod([{ ...closed, status: "reopened" }], "2026-08-01T12:00:00.000Z")?.status, "reopened");
});

test("bank custody split keeps own money apart from linked wallets", () => {
  const split = bankCustodySplit(800_000, [
    { spaceId: "kids", accountId: "bank", balanceMinor: 150_000 },
    { spaceId: "society", accountId: "bank", balanceMinor: 50_000 },
  ]);
  assert.equal(split.ownMinor, 800_000);
  assert.equal(split.heldMinor, 200_000);
  assert.equal(split.totalMinor, 1_000_000);
  assert.equal(split.mixed, true);
});

test("member credit is reserved against what they owe", () => {
  const claim = netMemberClaim(23_334_000, 10_000_000);
  assert.equal(claim.reservedMinor, 10_000_000);
  assert.equal(claim.debitMinor, 13_334_000);
  assert.equal(claim.creditMinor, 0);
  assert.equal(netMemberClaim(10_000, 40_000).creditMinor, 30_000);
  assert.equal(netMemberClaim(10_000, 40_000).debitMinor, 0);
  assert.equal(netMemberClaim(0, 0).reservedMinor, 0);
  assert.equal(netMemberClaim("23334000", "10000000").debitMinor, 13_334_000);
});

test("credit covers member debts oldest first", () => {
  const rows = applyCreditToDebits(
    [{ id: "a", amountMinor: 22_334_000 }, { id: "b", amountMinor: 22_334_000 }],
    10_000_000,
  );
  assert.equal(rows[0].payableMinor, 12_334_000);
  assert.equal(rows[0].reservedMinor, 10_000_000);
  assert.equal(rows[1].payableMinor, 22_334_000);
  assert.equal(rows[1].reservedMinor, 0);
});

test("home and control settle the same payable after reserving credit", () => {
  const rows = pendingSettlementsWithCredit(
    [
      { id: "s1", from_member_id: "abdul", amount_minor: 23_334_000 },
      { id: "s2", from_member_id: "abdul", amount_minor: 4_000_000 },
    ],
    { abdul: 1_000_000 },
  );
  assert.equal(rows[0].payableMinor, 22_334_000);
  assert.equal(rows[0].reservedMinor, 1_000_000);
  assert.equal(rows[1].payableMinor, 4_000_000);
  assert.equal(memberCashCreditMinor({ paid_minor: 51_000_000, extra_minor: 1_000_000, due_minor: 51_000_000 }), 1_000_000);
});
