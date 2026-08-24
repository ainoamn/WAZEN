import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 13 documents, installments, member patch, webhook test, openapi", () => {
  const documents = fs.readFileSync(path.join(root, "app/api/v1/documents/route.ts"), "utf8");
  const installments = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/installments/route.ts"), "utf8");
  const memberPatch = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/members/[memberId]/route.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const rate = fs.readFileSync(path.join(root, "lib/v1-rate-limit.ts"), "utf8");
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");

  assert.match(documents, /listV1Documents/);
  assert.match(documents, /enforceV1RateLimit/);
  assert.match(installments, /listV1Installments/);
  assert.match(memberPatch, /patchV1Member/);
  assert.match(memberPatch, /export async function PATCH/);
  assert.match(openapi, /openapi/);
  assert.match(hooks, /enqueueWebhookTest/);
  assert.match(hooks, /listWebhookDeliveries/);
  assert.match(hooks, /member\.updated/);
  assert.match(rate, /enforceV1RateLimit/);
  assert.match(platform, /testWebhook/);
  assert.match(platform, /listWebhookDeliveries/);
  assert.match(security, /testWebhook/);
  assert.match(security, /deliveries/);
  assert.match(developers, /\/installments/);
  assert.match(developers, /\/documents/);
  assert.match(developers, /phase \d+/);
});
