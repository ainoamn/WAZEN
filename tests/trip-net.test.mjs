import assert from "node:assert/strict";
import test from "node:test";
import { planTripSettlements, sameTransferSet, tripMemberPosition } from "../lib/trip-net.ts";

const FUND = "space:trip";

test("trip position nets fund contribution, pocket bills, shares and posted transfers", () => {
  const expenses = [
    { id: "f1", space_id: "trip", amount_minor: 600_000, paid_from: "common_fund" },
    { id: "p1", space_id: "trip", amount_minor: 400_000, paid_by_member_id: "ah", paid_from: "member" },
    { id: "v1", space_id: "trip", amount_minor: 999_000, paid_from: "common_fund", status: "voided" },
  ];
  const splits = [
    { expense_id: "f1", member_id: "dawood", share_minor: 300_000 },
    { expense_id: "f1", member_id: "ah", share_minor: 300_000 },
    { expense_id: "p1", member_id: "dawood", share_minor: 200_000 },
    { expense_id: "p1", member_id: "ah", share_minor: 200_000 },
    { expense_id: "v1", member_id: "dawood", share_minor: 999_000 },
  ];
  const settlements = [
    { space_id: "trip", from_member_id: FUND, to_member_id: "dawood", amount_minor: 50_000, status: "settled" },
    { space_id: "trip", from_member_id: "dawood", to_member_id: "ah", amount_minor: 70_000, status: "pending" },
  ];
  const dawood = tripMemberPosition({ spaceId: "trip", memberId: "dawood", paidMinor: 900_000, expenses, splits, settlements });
  assert.equal(dawood.fundShareMinor, 300_000);
  assert.equal(dawood.pocketShareMinor, 200_000);
  assert.equal(dawood.receivedMinor, 50_000);
  assert.equal(dawood.sentMinor, 0);
  assert.equal(dawood.netMinor, 900_000 - 300_000 - 200_000 - 50_000);

  const ah = tripMemberPosition({ spaceId: "trip", memberId: "ah", paidMinor: 0, expenses, splits, settlements });
  assert.equal(ah.pocketPaidMinor, 400_000);
  assert.equal(ah.netMinor, 400_000 - 300_000 - 200_000);
});

test("Azerbaijan plan: Majed pays AH, the fund pays AH and Dawood the rest", () => {
  const nets = [
    { memberId: "ah", netMinor: 841_620 + 856_421 },
    { memberId: "dawood", netMinor: 22_140 },
    { memberId: "majed", netMinor: -841_620 },
  ];
  const plan = planTripSettlements(nets, FUND);
  assert.deepEqual(plan, [
    { fromMemberId: "majed", toMemberId: "ah", amountMinor: 841_620 },
    { fromMemberId: FUND, toMemberId: "ah", amountMinor: 856_421 },
    { fromMemberId: FUND, toMemberId: "dawood", amountMinor: 22_140 },
  ]);
  const fundOut = plan.filter((row) => row.fromMemberId === FUND).reduce((sum, row) => sum + row.amountMinor, 0);
  assert.equal(fundOut, nets.reduce((sum, row) => sum + row.netMinor, 0));
});

test("debt left after member creditors are paid goes into the fund", () => {
  const plan = planTripSettlements(
    [
      { memberId: "a", netMinor: 10_000 },
      { memberId: "b", netMinor: -25_000 },
    ],
    FUND,
  );
  assert.deepEqual(plan, [
    { fromMemberId: "b", toMemberId: "a", amountMinor: 10_000 },
    { fromMemberId: "b", toMemberId: FUND, amountMinor: 15_000 },
  ]);
});

test("settled trip plans produce no transfers and identical pending rows are kept", () => {
  assert.deepEqual(planTripSettlements([{ memberId: "a", netMinor: 0 }], FUND), []);
  const plan = [{ fromMemberId: "b", toMemberId: "a", amountMinor: 10_000 }];
  assert.equal(sameTransferSet(plan, [{ from_member_id: "b", to_member_id: "a", amount_minor: "10000" }]), true);
  assert.equal(sameTransferSet(plan, [{ from_member_id: "b", to_member_id: "a", amount_minor: 9_999 }]), false);
});
