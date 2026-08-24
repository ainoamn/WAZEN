import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 22 account update/delete and personal rules", () => {
  const accountsLib = fs.readFileSync(path.join(root, "lib/v1-accounts.ts"), "utf8");
  const rulesLib = fs.readFileSync(path.join(root, "lib/v1-rules.ts"), "utf8");
  const accountRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/accounts/[accountId]/route.ts"), "utf8");
  const rulesRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/rules/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(accountsLib, /updateV1PersonalAccount/);
  assert.match(accountsLib, /deleteV1PersonalAccount/);
  assert.match(rulesLib, /listV1PersonalRules/);
  assert.match(rulesLib, /createV1PersonalRule/);
  assert.match(rulesLib, /generateV1PersonalOccurrences/);
  assert.match(accountRoute, /export async function PATCH/);
  assert.match(accountRoute, /export async function DELETE/);
  assert.match(rulesRoute, /listV1PersonalRules/);
  assert.match(rulesRoute, /createV1PersonalRule/);
  assert.match(hooks, /account\.updated/);
  assert.match(hooks, /account\.deleted/);
  assert.match(hooks, /rule\.created/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/accounts\/\{accountId\}/);
  assert.match(openapi, /\/rules/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /\/accounts\/\{accountId\}/);
  assert.match(developers, /\/rules/);
  assert.match(security, /account\.updated/);
  assert.match(security, /rule\.created/);
});
