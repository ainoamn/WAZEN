import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 19 transaction update, expense update/resplit, wallet links", () => {
  const txnLib = fs.readFileSync(path.join(root, "lib/v1-transactions.ts"), "utf8");
  const expensesLib = fs.readFileSync(path.join(root, "lib/v1-expenses.ts"), "utf8");
  const linksLib = fs.readFileSync(path.join(root, "lib/v1-links.ts"), "utf8");
  const txnRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/[transactionId]/route.ts"), "utf8");
  const expensePatch = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/expenses/[expenseId]/route.ts"), "utf8");
  const resplit = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/expenses/resplit/route.ts"), "utf8");
  const links = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/links/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(txnLib, /updateV1Transaction/);
  assert.match(expensesLib, /updateV1Expense/);
  assert.match(expensesLib, /resplitV1Expenses/);
  assert.match(linksLib, /linkV1Spaces/);
  assert.match(linksLib, /unlinkV1Spaces/);
  assert.match(txnRoute, /export async function PATCH/);
  assert.match(txnRoute, /updateV1Transaction/);
  assert.match(expensePatch, /updateV1Expense/);
  assert.match(resplit, /resplitV1Expenses/);
  assert.match(links, /listV1SpaceLinks/);
  assert.match(links, /linkV1Spaces/);
  assert.match(hooks, /transaction\.updated/);
  assert.match(hooks, /expense\.updated/);
  assert.match(hooks, /expense\.resplit/);
  assert.match(hooks, /space\.linked/);
  assert.match(hooks, /space\.unlinked/);
  assert.match(openapi, /phase19/);
  assert.match(openapi, /\/links/);
  assert.match(openapi, /\/expenses\/resplit/);
  assert.match(developers, /phase 19/);
  assert.match(developers, /\/links/);
  assert.match(developers, /\/expenses\/resplit/);
  assert.match(security, /transaction\.updated/);
  assert.match(security, /space\.linked/);
});
