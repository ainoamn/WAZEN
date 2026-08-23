import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateOldestFirst,
  accruedDueMinor,
  buildInstallmentSchedule,
  selectByAmount,
  selectThroughOldest,
  totalRemainingMinor,
} from "../lib/installments.ts";
import { DEFAULT_DIAL_CODE, dialCodesForSelect } from "../lib/country-dial-codes.ts";
import { composeWhatsAppPhone, isLikelyPhone, splitPhoneParts, toWhatsAppNumber } from "../lib/phone.ts";

test("member schedule computes total and marks paid months from cash already received", () => {
  const schedule = buildInstallmentSchedule({
    memberId: "m1",
    spaceId: "s1",
    startAt: "2026-01-15T00:00:00.000Z",
    durationMonths: 12,
    amountMinor: 20_000,
    paidMinor: 50_000,
  });
  assert.equal(schedule.totalMinor, 240_000);
  assert.equal(schedule.rows.length, 12);
  assert.equal(schedule.rows[0].status, "paid");
  assert.equal(schedule.rows[1].status, "paid");
  assert.equal(schedule.rows[2].status, "partial");
  assert.equal(schedule.rows[2].paid_minor, 10_000);
  assert.equal(schedule.rows[3].status, "unpaid");
  assert.equal(schedule.unpaidCount, 10);
});

test("smart accountant pays oldest invoices first and leaves newer unpaid", () => {
  const schedule = buildInstallmentSchedule({
    memberId: "m1",
    spaceId: "s1",
    startAt: "2026-01-01T00:00:00.000Z",
    durationMonths: 6,
    amountMinor: 10_000,
    paidMinor: 0,
  });
  const paid = allocateOldestFirst(schedule.rows, 25_000);
  assert.equal(paid.appliedMinor, 25_000);
  assert.equal(paid.leftoverMinor, 0);
  assert.deepEqual(paid.allocations.map((item) => item.periodIndex), [1, 2, 3]);
  assert.equal(paid.allocations[2].amountMinor, 5_000);
});

test("selecting a later month still auto-includes older unpaid months", () => {
  const schedule = buildInstallmentSchedule({
    memberId: "m1",
    spaceId: "s1",
    startAt: "2026-01-01T00:00:00.000Z",
    durationMonths: 5,
    amountMinor: 10_000,
  });
  const ids = selectThroughOldest(schedule.rows, 3);
  assert.equal(ids.length, 3);
  assert.equal(totalRemainingMinor(schedule.rows, ids), 30_000);
  const byAmount = selectByAmount(schedule.rows, 10_000);
  assert.equal(byAmount.length, 1);
});

test("accrued dues stop at the current month and ignore future installments", () => {
  const schedule = buildInstallmentSchedule({
    memberId: "m1",
    spaceId: "s1",
    startAt: "2026-01-15T00:00:00.000Z",
    durationMonths: 12,
    amountMinor: 20_000,
  });
  const asOf = new Date("2026-03-20T00:00:00.000Z");
  assert.equal(accruedDueMinor(schedule.rows, asOf), 60_000);
  assert.equal(accruedDueMinor(schedule.rows, new Date("2026-01-15T12:00:00.000Z")), 20_000);
});

test("omani phones become WhatsApp numbers", () => {
  assert.equal(toWhatsAppNumber("91234567"), "96891234567");
  assert.equal(toWhatsAppNumber("091234567"), "96891234567");
  assert.equal(toWhatsAppNumber("+968 9123 4567"), "96891234567");
  assert.equal(toWhatsAppNumber("9904406"), "9689904406");
  assert.equal(isLikelyPhone("9904406"), true);
  assert.equal(isLikelyPhone("12"), false);
});

test("member phone dial codes default to Oman and cover the world", () => {
  assert.equal(DEFAULT_DIAL_CODE, "968");
  const listed = dialCodesForSelect("en");
  assert.equal(listed[0].iso2, "OM");
  assert.ok(listed.length >= 190);
  assert.ok(listed.some((item) => item.iso2 === "AE" && item.dial === "971"));
  assert.ok(listed.some((item) => item.iso2 === "US" && item.dial === "1"));
  assert.equal(composeWhatsAppPhone("968", "9904406"), "9689904406");
  assert.equal(composeWhatsAppPhone("971", "0501234567"), "971501234567");
  assert.equal(composeWhatsAppPhone("966", "501234567"), "966501234567");
  const oman = splitPhoneParts("9689904406");
  assert.equal(oman.dial, "968");
  assert.equal(oman.national, "9904406");
  const uae = splitPhoneParts("+971 50 123 4567");
  assert.equal(uae.dial, "971");
  assert.equal(uae.national, "501234567");
});
