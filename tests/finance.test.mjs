import assert from "node:assert/strict";
import test from "node:test";
import { buildCircleOrder, minimizeSettlements, splitContributionPayment, splitEvenly, validateJournal } from "../lib/finance.ts";

test("equal expense splits preserve every minor unit", () => {
  const splits = splitEvenly(100, ["a", "b", "c"]);
  assert.deepEqual(splits.map((item) => item.shareMinor), [34, 33, 33]);
  assert.equal(splits.reduce((sum, item) => sum + item.shareMinor, 0), 100);
});

test("contribution payment splits mandatory and protected surplus", () => {
  // 20.00 SAR plan, receive 50.00 SAR → 20 mandatory + 30 personal reserve
  const split = splitContributionPayment(5000, 2000, { remainingDueMinor: 120_000, extraPolicy: "personal_reserve" });
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
