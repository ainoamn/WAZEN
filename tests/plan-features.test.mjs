import assert from "node:assert/strict";
import test from "node:test";
import { planAllowsSpaceType, planHasFeature, resolveEntitlements } from "../lib/plan-features.ts";

test("admin deny removes a plan feature and grant adds one", () => {
  const resolved = resolveEntitlements({
    planFeatures: ["personal", "household", "statements"],
    grant: ["advanced_reports"],
    deny: ["statements"],
    walletLimit: 3,
    memberLimit: 10,
    walletLimitOverride: 8,
  });
  assert.equal(planHasFeature(resolved.features, "statements"), false);
  assert.equal(planHasFeature(resolved.features, "advanced_reports"), true);
  assert.equal(planAllowsSpaceType(resolved.features, "household"), true);
  assert.equal(resolved.walletLimit, 8);
  assert.equal(resolved.memberLimit, 10);
});
