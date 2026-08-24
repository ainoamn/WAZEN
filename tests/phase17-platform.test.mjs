import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 17 circle, archive wallet, void settlement", () => {
  const circleLib = fs.readFileSync(path.join(root, "lib/v1-circle.ts"), "utf8");
  const spacesLib = fs.readFileSync(path.join(root, "lib/v1-spaces.ts"), "utf8");
  const settlementsLib = fs.readFileSync(path.join(root, "lib/v1-settlements.ts"), "utf8");
  const circleGet = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/circle/route.ts"), "utf8");
  const circleOrder = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/circle/order/route.ts"), "utf8");
  const turnComplete = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/circle/turns/[turnId]/complete/route.ts"), "utf8");
  const archive = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/archive/route.ts"), "utf8");
  const voidSettlement = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/settlements/[settlementId]/void/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(circleLib, /setV1CircleOrder/);
  assert.match(circleLib, /completeV1CircleTurn/);
  assert.match(spacesLib, /archiveV1Space/);
  assert.match(settlementsLib, /voidV1Settlement/);
  assert.match(circleGet, /getV1Circle/);
  assert.match(circleOrder, /setV1CircleOrder/);
  assert.match(turnComplete, /completeV1CircleTurn/);
  assert.match(archive, /archiveV1Space/);
  assert.match(voidSettlement, /voidV1Settlement/);
  assert.match(hooks, /circle\.order_set/);
  assert.match(hooks, /circle\.turn_paid/);
  assert.match(hooks, /space\.archived/);
  assert.match(hooks, /settlement\.voided/);
  assert.match(openapi, /phase17/);
  assert.match(openapi, /\/circle\/order/);
  assert.match(developers, /phase 17/);
  assert.match(developers, /\/circle/);
  assert.match(developers, /circles:write/);
  assert.match(security, /circle\.order_set/);
  assert.match(security, /settlement\.voided/);
});
