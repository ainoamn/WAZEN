import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 16 expenses write, spaces create/update, export CSV", () => {
  const expensesLib = fs.readFileSync(path.join(root, "lib/v1-expenses.ts"), "utf8");
  const spacesLib = fs.readFileSync(path.join(root, "lib/v1-spaces.ts"), "utf8");
  const exportLib = fs.readFileSync(path.join(root, "lib/v1-export.ts"), "utf8");
  const expenses = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/expenses/route.ts"), "utf8");
  const voidExpense = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/expenses/[expenseId]/void/route.ts"), "utf8");
  const spaces = fs.readFileSync(path.join(root, "app/api/v1/spaces/route.ts"), "utf8");
  const spaceOne = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/route.ts"), "utf8");
  const exportRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/export/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(expensesLib, /createV1Expense/);
  assert.match(expensesLib, /voidV1Expense/);
  assert.match(spacesLib, /createV1Space/);
  assert.match(spacesLib, /updateV1Space/);
  assert.match(exportLib, /exportV1SpaceCsv/);
  assert.match(expenses, /createV1Expense/);
  assert.match(voidExpense, /voidV1Expense/);
  assert.match(spaces, /createV1Space/);
  assert.match(spaceOne, /updateV1Space/);
  assert.match(exportRoute, /exportV1SpaceCsv/);
  assert.match(hooks, /expense\.created/);
  assert.match(hooks, /expense\.voided/);
  assert.match(hooks, /space\.created/);
  assert.match(hooks, /space\.updated/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/export/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /POST.*\/expenses/);
  assert.match(security, /expense\.created/);
  assert.match(security, /space\.created/);
});
