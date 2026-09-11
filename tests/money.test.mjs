import assert from "node:assert/strict";
import test from "node:test";
import { formatDebitMoneyMinor, formatMoneyMinor, formatSignedMoneyMinor } from "../lib/money.ts";

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
