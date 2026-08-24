import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 15 contribution-plan, reopen, expenses, me, rate limits", () => {
  const planLib = fs.readFileSync(path.join(root, "lib/v1-contribution-plan.ts"), "utf8");
  const expensesLib = fs.readFileSync(path.join(root, "lib/v1-expenses.ts"), "utf8");
  const periodsLib = fs.readFileSync(path.join(root, "lib/v1-periods.ts"), "utf8");
  const planRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/contribution-plan/route.ts"), "utf8");
  const reopen = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/periods/[periodId]/reopen/route.ts"), "utf8");
  const expenses = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/expenses/route.ts"), "utf8");
  const me = fs.readFileSync(path.join(root, "app/api/v1/me/route.ts"), "utf8");
  const spaces = fs.readFileSync(path.join(root, "app/api/v1/spaces/route.ts"), "utf8");
  const transactions = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(planLib, /updateV1ContributionPlan/);
  assert.match(planLib, /buildInstallmentSchedule/);
  assert.match(expensesLib, /listV1Expenses/);
  assert.match(periodsLib, /reopenV1Period/);
  assert.match(planRoute, /getV1ContributionPlan/);
  assert.match(planRoute, /updateV1ContributionPlan/);
  assert.match(planRoute, /enforceV1RateLimit/);
  assert.match(reopen, /reopenV1Period/);
  assert.match(expenses, /listV1Expenses/);
  assert.match(me, /v1\.me\.get/);
  assert.match(spaces, /enforceV1RateLimit/);
  assert.match(transactions, /enforceV1RateLimit/);
  assert.match(hooks, /period\.reopened/);
  assert.match(hooks, /contribution_plan\.updated/);
  assert.match(openapi, /phase15/);
  assert.match(openapi, /contribution-plan/);
  assert.match(developers, /\/contribution-plan/);
  assert.match(developers, /\/expenses/);
  assert.match(developers, /\/me/);
  assert.match(developers, /phase 15/);
  assert.match(security, /period\.reopened/);
  assert.match(security, /contribution_plan\.updated/);
});
