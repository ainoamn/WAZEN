import assert from "node:assert/strict";
import test from "node:test";
import { dashboardNavLocked, planAllowsSpaceType, planHasFeature, resolveEntitlements, sidebarAllowsWalletView } from "../lib/plan-features.ts";
import { pageTransactions } from "../lib/transaction-page.ts";

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

test("sidebar keeps wallet types the user already has even on a personal-only plan", () => {
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal", "trip", "society"], "trip"), true);
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal", "group"], "society"), true);
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal"], "household"), false);
  assert.equal(sidebarAllowsWalletView([], ["personal"], "personal"), true);
});

test("dashboard nav stays listed but locked when the plan does not include the feature", () => {
  assert.equal(dashboardNavLocked(["personal"], ["personal"], "household"), true);
  assert.equal(dashboardNavLocked(["personal"], ["personal"], "reports"), true);
  assert.equal(dashboardNavLocked(["personal"], ["personal", "household"], "household"), false);
  assert.equal(dashboardNavLocked(["personal", "advanced_reports"], ["personal"], "reports"), false);
  assert.equal(dashboardNavLocked(["personal"], ["personal"], "overview"), false);
});

test("transaction pager defaults to five and never shows more than 100", () => {
  const rows = Array.from({ length: 140 }, (_, index) => index + 1);
  const first = pageTransactions(rows, 1, 5);
  assert.deepEqual(first.rows, [1, 2, 3, 4, 5]);
  assert.equal(first.pages, 20);
  assert.equal(first.truncated, true);
  const hundred = pageTransactions(rows, 1, 100);
  assert.equal(hundred.rows.length, 100);
  assert.equal(hundred.total, 100);
  const second = pageTransactions(rows, 2, 5);
  assert.deepEqual(second.rows, [6, 7, 8, 9, 10]);
  const invalid = pageTransactions(rows, 1, 7);
  assert.equal(invalid.size, 5);
});
