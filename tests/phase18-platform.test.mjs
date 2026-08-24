import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 18 shares, transaction detail/revisions, notifications", () => {
  const sharesLib = fs.readFileSync(path.join(root, "lib/v1-shares.ts"), "utf8");
  const txnLib = fs.readFileSync(path.join(root, "lib/v1-transactions.ts"), "utf8");
  const receipt = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/shares/receipt/route.ts"), "utf8");
  const memberStmt = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/shares/member-statement/route.ts"), "utf8");
  const assocStmt = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/shares/statement/route.ts"), "utf8");
  const txnGet = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/[transactionId]/route.ts"), "utf8");
  const revisions = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/[transactionId]/revisions/route.ts"), "utf8");
  const notifications = fs.readFileSync(path.join(root, "app/api/v1/notifications/route.ts"), "utf8");
  const notificationsRead = fs.readFileSync(path.join(root, "app/api/v1/notifications/read/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(sharesLib, /createV1ReceiptShare/);
  assert.match(sharesLib, /createV1MemberStatementShare/);
  assert.match(sharesLib, /createV1AssociationStatementShare/);
  assert.match(txnLib, /getV1Transaction/);
  assert.match(txnLib, /listV1TransactionRevisions/);
  assert.match(receipt, /createV1ReceiptShare/);
  assert.match(memberStmt, /createV1MemberStatementShare/);
  assert.match(assocStmt, /createV1AssociationStatementShare/);
  assert.match(txnGet, /getV1Transaction/);
  assert.match(revisions, /listV1TransactionRevisions/);
  assert.match(notifications, /listUserNotifications/);
  assert.match(notificationsRead, /markNotificationsRead/);
  assert.match(hooks, /share\.created/);
  assert.match(openapi, /phase18/);
  assert.match(openapi, /\/shares\/receipt/);
  assert.match(openapi, /\/notifications/);
  assert.match(developers, /phase 18/);
  assert.match(developers, /\/shares\//);
  assert.match(developers, /\/notifications/);
  assert.match(security, /share\.created/);
});
