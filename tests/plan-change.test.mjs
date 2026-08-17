import assert from "node:assert/strict";
import test from "node:test";
import { classifyPlanChange, dayAfterIso } from "../lib/plan-change-rules.ts";

test("plan change classifies upgrade downgrade and same", () => {
  assert.equal(classifyPlanChange(null, { sort_order: 1, monthly_minor: 0 }), "upgrade");
  assert.equal(classifyPlanChange({ sort_order: 1, monthly_minor: 0 }, { sort_order: 2, monthly_minor: 2900 }), "upgrade");
  assert.equal(classifyPlanChange({ sort_order: 3, monthly_minor: 7900 }, { sort_order: 1, monthly_minor: 0 }), "downgrade");
  assert.equal(classifyPlanChange({ sort_order: 2, monthly_minor: 2900 }, { sort_order: 2, monthly_minor: 2900 }), "same");
  assert.equal(classifyPlanChange({ sort_order: 2, monthly_minor: 1000 }, { sort_order: 2, monthly_minor: 2000 }), "upgrade");
});

test("downgrade becomes effective the UTC day after period end", () => {
  assert.equal(dayAfterIso("2026-08-17T15:30:00.000Z"), "2026-08-18T00:00:00.000Z");
  assert.equal(dayAfterIso("2026-12-31T23:00:00.000Z"), "2027-01-01T00:00:00.000Z");
});
