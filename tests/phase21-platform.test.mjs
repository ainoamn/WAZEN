import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 21 personal accounts, bank link, and linked transfer", () => {
  const accountsLib = fs.readFileSync(path.join(root, "lib/v1-accounts.ts"), "utf8");
  const linksLib = fs.readFileSync(path.join(root, "lib/v1-links.ts"), "utf8");
  const accounts = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/accounts/route.ts"), "utf8");
  const bank = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/links/bank/route.ts"), "utf8");
  const transfer = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/links/transfer/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(accountsLib, /listV1PersonalAccounts/);
  assert.match(accountsLib, /createV1PersonalAccount/);
  assert.match(linksLib, /setV1WalletBankLink/);
  assert.match(linksLib, /transferV1LinkedFunds/);
  assert.match(linksLib, /bankAccountId/);
  assert.match(accounts, /listV1PersonalAccounts/);
  assert.match(accounts, /createV1PersonalAccount/);
  assert.match(bank, /setV1WalletBankLink/);
  assert.match(bank, /export async function PUT/);
  assert.match(transfer, /transferV1LinkedFunds/);
  assert.match(hooks, /space\.bank_linked/);
  assert.match(hooks, /space\.bank_unlinked/);
  assert.match(hooks, /space\.transferred/);
  assert.match(hooks, /account\.created/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/accounts/);
  assert.match(openapi, /\/links\/bank/);
  assert.match(openapi, /\/links\/transfer/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /\/accounts/);
  assert.match(developers, /\/links\/transfer/);
  assert.match(security, /space\.transferred/);
  assert.match(security, /account\.created/);
});
