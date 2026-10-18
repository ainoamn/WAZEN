import assert from "node:assert/strict";
import test from "node:test";
import { archiveIsClear } from "../lib/archive-gate.ts";

test("archive clears only when settlements and (when counted) installments are zero", () => {
  assert.equal(archiveIsClear({
    pendingSettlements: 0,
    pendingSettlementsMinor: 0,
    unpaidInstallments: 0,
    unpaidInstallmentsMinor: 0,
  }), true);
  assert.equal(archiveIsClear({
    pendingSettlements: 1,
    pendingSettlementsMinor: 1000,
    unpaidInstallments: 0,
    unpaidInstallmentsMinor: 0,
  }), false);
  assert.equal(archiveIsClear({
    pendingSettlements: 0,
    pendingSettlementsMinor: 0,
    unpaidInstallments: 8,
    unpaidInstallmentsMinor: 8000,
  }), false);
});
