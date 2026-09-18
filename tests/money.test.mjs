import assert from "node:assert/strict";
import test from "node:test";
import { applyTypedFundShare, finalizeTypedFundShare, formatDebitMoneyMinor, formatMoneyMinor, formatSignedMoneyMinor } from "../lib/money.ts";

test("negative money uses red-ready parentheses instead of a minus", () => {
  const label = formatMoneyMinor(-36_843, "OMR", "ar");
  assert.match(label, /^\(/);
  assert.match(label, /\)$/);
  assert.doesNotMatch(label, /-/);
  assert.equal(formatSignedMoneyMinor(-36_843, "OMR", "ar"), label);
  assert.equal(formatMoneyMinor(200_000, "OMR", "ar"), formatSignedMoneyMinor(200_000, "OMR", "ar"));
});

test("debit magnitudes wrap even when stored as a positive", () => {
  const label = formatDebitMoneyMinor(18_422, "OMR", "ar");
  assert.match(label, /^\(/);
  assert.match(label, /\)$/);
  assert.equal(formatDebitMoneyMinor(0, "OMR", "ar"), formatMoneyMinor(0, "OMR", "ar"));
});

test("typed fund share keeps 7. then 7.5 instead of snapping to a whole rial", () => {
  assert.deepEqual(applyTypedFundShare({ typed: "7", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }), {
    fundAmount: "7",
    fundMinor: 7_000,
    memberAmount: "98.843",
  });
  assert.deepEqual(applyTypedFundShare({ typed: "7.", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }), {
    fundAmount: "7.",
  });
  assert.deepEqual(applyTypedFundShare({ typed: "7.5", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }), {
    fundAmount: "7.5",
    fundMinor: 7_500,
    memberAmount: "98.343",
  });
  assert.deepEqual(applyTypedFundShare({ typed: "7.500", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }), {
    fundAmount: "7.500",
    fundMinor: 7_500,
    memberAmount: "98.343",
  });
  assert.equal(applyTypedFundShare({ typed: "7.5001", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }), null);
  assert.deepEqual(
    finalizeTypedFundShare({ typed: "7.5", totalMinor: 105_843, fundCashMinor: 1_038_650, currency: "OMR" }),
    { fundAmount: "7.500", memberAmount: "98.343", fundMinor: 7_500 },
  );
});
