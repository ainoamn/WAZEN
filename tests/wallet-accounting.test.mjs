import assert from "node:assert/strict";
import test from "node:test";
import {
  applySettledTransfers,
  isPeerSettlementTransfer,
  memberFundPoolNet,
  memberTripPaidMinor,
  memberTripPocketMinor,
  minimizeSettlements,
  netMemberClaim,
  netTripMemberBalances,
  splitEvenly,
  tripPostedSpendMinor,
} from "../lib/finance.ts";
import { buildMemberLedger } from "../lib/member-ledger.ts";

const members = [
  { id: "abdul", name: "عبد الحميد" },
  { id: "ali", name: "علي" },
  { id: "hamdan", name: "عمر حمدان" },
  { id: "hamoud", name: "عمر حمود" },
  { id: "dawood", name: "داود عبد الله" },
  { id: "harith", name: "حارث خميس" },
];
const ids = members.map((row) => row.id);

function bandarExpenses() {
  const bills = [
    { id: "cable", paid_by_member_id: "ali", amount_minor: 17_000 },
    { id: "meat", paid_by_member_id: "hamoud", amount_minor: 13_400 },
    { id: "petrol", paid_by_member_id: "dawood", amount_minor: 2_000 },
    { id: "ration", paid_by_member_id: "harith", amount_minor: 50_401 },
  ];
  const splits = bills.flatMap((bill) => splitEvenly(bill.amount_minor, ids).map((row) => ({
    expense_id: bill.id,
    member_id: row.memberId,
    share_minor: row.shareMinor,
  })));
  return { bills, splits };
}

test("society: unpaid goal is a debt; fund shares net against paid", () => {
  const leftover = memberFundPoolNet(200_000, 40_000);
  assert.equal(leftover.leftoverMinor, 160_000);
  assert.equal(leftover.shortfallMinor, 0);
  const short = memberFundPoolNet(100_000, 165_500);
  assert.equal(short.shortfallMinor, 65_500);
  const claim = netMemberClaim(10_000, 0);
  assert.equal(claim.debitMinor, 10_000);
  const ledger = buildMemberLedger({
    member: {
      id: "m1",
      space_id: "society",
      display_name: "ماجد",
      due_minor: 20_000,
      paid_minor: 0,
      extra_minor: 0,
      addon_minor: 0,
      joined_at: "2026-01-01T00:00:00.000Z",
    },
    spaceNameAr: "جمعية",
    spaceNameEn: "Circle",
    currency: "OMR",
    spaceType: "society",
    plan: { amount_minor: 20_000, duration_months: 1, starts_at: "2026-01-01T00:00:00.000Z" },
    installments: [],
    transactions: [],
    settlements: [],
    tripExpenses: [],
    expenseSplits: [],
  });
  assert.ok(ledger.owesMinor >= 20_000);
});

test("trip: Bandar pocket bills, nets, and paid shares match the live wallet", () => {
  const { bills, splits } = bandarExpenses();
  const expenses = bills.map((bill) => ({ ...bill, space_id: "bandar", paid_from: "member", status: "posted" }));
  assert.equal(tripPostedSpendMinor("bandar", expenses), 82_801);
  assert.equal(memberTripPocketMinor("ali", "bandar", expenses), 17_000);
  assert.equal(memberTripPocketMinor("hamoud", "bandar", expenses), 13_400);
  assert.equal(memberTripPocketMinor("dawood", "bandar", expenses), 2_000);
  assert.equal(memberTripPocketMinor("harith", "bandar", expenses), 50_401);
  assert.equal(memberTripPocketMinor("abdul", "bandar", expenses), 0);

  const nets = Object.fromEntries(netTripMemberBalances({
    memberIds: ids,
    expenses: bills,
    splits,
  }).map((row) => [row.memberId, row.balanceMinor]));
  assert.equal(nets.abdul, -13_803);
  assert.equal(nets.ali, 3_198);
  assert.equal(nets.hamdan, -13_799);
  assert.equal(nets.hamoud, -399);
  assert.equal(nets.dawood, -11_799);
  assert.equal(nets.harith, 36_602);
  assert.equal(Object.values(nets).reduce((sum, value) => sum + value, 0), 0);

  const transfers = minimizeSettlements(ids.map((memberId) => ({ memberId, balanceMinor: nets[memberId] })));
  assert.deepEqual(new Map(transfers.map((row) => [`${row.fromMemberId}->${row.toMemberId}`, row.amountMinor])), new Map([
    ["abdul->harith", 13_803],
    ["hamdan->harith", 13_799],
    ["dawood->harith", 9_000],
    ["dawood->ali", 2_799],
    ["hamoud->ali", 399],
  ]));

  const after = applySettledTransfers(
    ids.map((memberId) => ({ memberId, balanceMinor: nets[memberId] })),
    transfers.map((row) => ({ fromMemberId: row.fromMemberId, toMemberId: row.toMemberId, amountMinor: row.amountMinor })),
  );
  assert.ok(after.every((row) => row.balanceMinor === 0));
  assert.deepEqual(minimizeSettlements(after), []);

  const settlements = transfers.map((row, index) => ({
    id: `st${index}`,
    space_id: "bandar",
    from_member_id: row.fromMemberId,
    to_member_id: row.toMemberId,
    amount_minor: row.amountMinor,
    status: "settled",
    settled_at: "2026-09-09T12:00:00.000Z",
  }));
  const extras = { expenses, splits };
  const shareOf = (memberId) => splits.filter((row) => row.member_id === memberId).reduce((sum, row) => sum + row.share_minor, 0);
  assert.equal(memberTripPaidMinor("abdul", "bandar", 0, settlements, extras), 13_803);
  assert.equal(memberTripPaidMinor("ali", "bandar", 0, settlements, extras), 13_802);
  assert.equal(memberTripPaidMinor("hamdan", "bandar", 0, settlements, extras), 13_799);
  assert.equal(memberTripPaidMinor("hamoud", "bandar", 0, settlements, extras), 13_799);
  assert.equal(memberTripPaidMinor("dawood", "bandar", 0, settlements, extras), 13_799);
  assert.equal(memberTripPaidMinor("harith", "bandar", 0, settlements, extras), 13_799);
  assert.equal(shareOf("abdul") + shareOf("ali") + shareOf("hamdan") + shareOf("hamoud") + shareOf("dawood") + shareOf("harith"), 82_801);
  assert.equal(memberTripPaidMinor("ali", "bandar", 0, settlements), 0);

  const abdul = buildMemberLedger({
    member: {
      id: "abdul",
      space_id: "bandar",
      display_name: "عبد الحميد",
      due_minor: 10_000,
      paid_minor: 0,
      extra_minor: 0,
      addon_minor: 0,
      joined_at: "2026-09-05T00:00:00.000Z",
    },
    spaceNameAr: "بندر الصقله",
    spaceNameEn: "Trip",
    currency: "OMR",
    spaceType: "trip",
    plan: { amount_minor: 10_000, duration_months: 1, starts_at: "2026-09-05T00:00:00.000Z" },
    installments: [],
    transactions: [],
    settlements,
    tripExpenses: expenses,
    expenseSplits: splits,
  });
  assert.equal(abdul.owesMinor, 0);
  assert.equal(abdul.creditMinor, 0);
  assert.equal(abdul.paidMinor, 13_803);
});

test("peer settlement journals never count as society salary or trip income", () => {
  assert.equal(isPeerSettlementTransfer({ description_ar: "مبلغ إضافي · تسوية حصة «مصروف جماعي» إلى علي" }), true);
  assert.equal(isPeerSettlementTransfer({ description_ar: "راتب سبتمبر" }), false);
  assert.equal(isPeerSettlementTransfer({ description_ar: "مساهمة شهر 9" }), false);
});
