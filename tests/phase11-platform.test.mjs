import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 11 Business API void, audit, surplus, write keys", () => {
  const ledgerVoid = fs.readFileSync(path.join(root, "lib/ledger-void.ts"), "utf8");
  const surplus = fs.readFileSync(path.join(root, "lib/v1-surplus.ts"), "utf8");
  const audit = fs.readFileSync(path.join(root, "lib/v1-audit.ts"), "utf8");
  const voidRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/[transactionId]/void/route.ts"), "utf8");
  const auditRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/audit/route.ts"), "utf8");
  const surplusRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/surplus/withdraw/route.ts"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(ledgerVoid, /export async function voidApprovedTransaction/);
  assert.match(ledgerVoid, /writeApprovedCashBalance/);
  assert.match(dashboard, /from \"\.\.\/\.\.\/\.\.\/lib\/ledger-void\"/);
  assert.match(voidRoute, /voidApprovedTransaction/);
  assert.match(voidRoute, /export async function POST/);
  assert.match(audit, /listV1SpaceAudit/);
  assert.match(auditRoute, /listV1SpaceAudit/);
  assert.match(surplus, /withdrawV1Surplus/);
  assert.match(surplusRoute, /withdrawV1Surplus/);
  assert.match(developers, /transactions\/\{transactionId\}\/void/);
  assert.match(developers, /surplus\/withdraw/);
  assert.match(developers, /phase \d+/);
  assert.match(security, /createKey\(\"write\"\)/);
  assert.match(security, /settlements:write/);
});
