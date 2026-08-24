import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 20 webhook management under Business API v1", () => {
  const listCreate = fs.readFileSync(path.join(root, "app/api/v1/webhooks/route.ts"), "utf8");
  const revoke = fs.readFileSync(path.join(root, "app/api/v1/webhooks/[webhookId]/route.ts"), "utf8");
  const testRoute = fs.readFileSync(path.join(root, "app/api/v1/webhooks/[webhookId]/test/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(listCreate, /listIntegrationWebhooks/);
  assert.match(listCreate, /createIntegrationWebhook/);
  assert.match(listCreate, /webhooks:read/);
  assert.match(listCreate, /webhooks:write/);
  assert.match(revoke, /revokeIntegrationWebhook/);
  assert.match(revoke, /export async function DELETE/);
  assert.match(testRoute, /enqueueWebhookTest/);
  assert.match(hooks, /enqueueWebhookTest/);
  assert.match(platform, /webhooks:read/);
  assert.match(platform, /webhooks:write/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/api\/v1\/webhooks/);
  assert.match(openapi, /\/webhooks\/\{webhookId\}\/test/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /\/api\/v1\/webhooks/);
  assert.match(developers, /webhooks:write/);
  assert.match(security, /webhooks:read/);
  assert.match(security, /webhooks:write/);
});
