import assert from "node:assert/strict";
import test from "node:test";
import { dashboardNavLocked, formatQuota, planAllowsSpaceType, planHasFeature, quotaIsUnlimited, quotaWouldExceed, resolveEntitlements, sidebarAllowsWalletView, upgradeNoticeFor } from "../lib/plan-features.ts";
import { pageTransactions } from "../lib/transaction-page.ts";

test("admin deny removes a plan feature and grant adds one", () => {
  const resolved = resolveEntitlements({
    planFeatures: ["personal", "household", "statements"],
    grant: ["advanced_reports"],
    deny: ["statements"],
    walletLimit: 3,
    memberLimit: 10,
    transactionLimit: 50,
    recordLimit: 20,
    userLimit: 2,
    walletLimitOverride: 8,
    transactionLimitOverride: 200,
  });
  assert.equal(planHasFeature(resolved.features, "statements"), false);
  assert.equal(planHasFeature(resolved.features, "advanced_reports"), true);
  assert.equal(planAllowsSpaceType(resolved.features, "household"), true);
  assert.equal(resolved.walletLimit, 8);
  assert.equal(resolved.memberLimit, 10);
  assert.equal(resolved.transactionLimit, 200);
  assert.equal(resolved.recordLimit, 20);
  assert.equal(resolved.userLimit, 2);
});

test("sidebar keeps wallet types the user already has even on a personal-only plan", () => {
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal", "trip", "society"], "trip"), true);
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal", "group"], "society"), true);
  assert.equal(sidebarAllowsWalletView(["personal"], ["personal"], "household"), false);
  assert.equal(sidebarAllowsWalletView([], ["personal"], "personal"), true);
});

test("dashboard nav stays listed but locked when the plan does not include the feature", () => {
  const starterViews = ["overview", "personal", "household", "groups", "trip", "society", "transactions", "reports"];
  const starter = ["personal"];
  const existing = ["personal"];
  assert.deepEqual(
    starterViews.map((view) => [view, dashboardNavLocked(starter, existing, view)]),
    [
      ["overview", false],
      ["personal", false],
      ["household", true],
      ["groups", true],
      ["trip", true],
      ["society", true],
      ["transactions", false],
      ["reports", true],
    ],
  );
  assert.equal(dashboardNavLocked(["personal"], ["personal", "household"], "household"), false);
  assert.equal(dashboardNavLocked(["personal", "advanced_reports"], ["personal"], "reports"), false);
});

test("locked nav copy tells the user which plan to upgrade to", () => {
  const notice = upgradeNoticeFor("ar", "الجمعيات", "society");
  assert.match(notice.text, /رقِّ الباقة إلى العائلة/);
  assert.match(notice.text, /الجمعيات/);
  const docs = upgradeNoticeFor("en", "Documents & statements", "documents");
  assert.match(docs.text, /Professional/);
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

test("zero or 9999 quota is unlimited and blocks only when the cap is exceeded", () => {
  assert.equal(quotaIsUnlimited(0), true);
  assert.equal(quotaIsUnlimited(9999), true);
  assert.equal(quotaIsUnlimited(50), false);
  assert.equal(quotaWouldExceed(50, 1, 50), true);
  assert.equal(quotaWouldExceed(49, 1, 50), false);
  assert.equal(quotaWouldExceed(10_000, 1, 0), false);
  assert.equal(formatQuota(0, "ar"), "غير محدود");
  assert.equal(formatQuota(25, "en"), "25");
  const open = resolveEntitlements({
    planFeatures: ["personal"],
    walletLimit: 1,
    memberLimit: 2,
    transactionLimit: 0,
    recordLimit: 0,
    userLimit: 1,
  });
  assert.equal(quotaIsUnlimited(open.transactionLimit), true);
  assert.equal(open.userLimit, 1);
});
