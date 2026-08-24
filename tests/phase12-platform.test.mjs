import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 12 webhooks, summary, contributions markers", () => {
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const outbound = fs.readFileSync(path.join(root, "lib/outbound.ts"), "utf8");
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const summary = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/summary/route.ts"), "utf8");
  const contributions = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/contributions/route.ts"), "utf8");
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");

  assert.match(runtime, /SCHEMA_VERSION = 21/);
  assert.match(runtime, /integration_webhooks/);
  assert.match(runtime, /webhook_outbox/);
  assert.match(hooks, /processWebhookOutbox/);
  assert.match(hooks, /enqueueIntegrationEvent/);
  assert.match(hooks, /x-wazen-signature/);
  assert.match(outbound, /validatePublicHttpsWebhookUrl/);
  assert.match(tick, /processWebhookOutbox/);
  assert.match(tick, /runWebhooks/);
  assert.match(summary, /buildV1SpaceSummary/);
  assert.match(contributions, /recordV1Contribution/);
  assert.match(platform, /createWebhook/);
  assert.match(platform, /view === "webhooks"/);
  assert.match(security, /createWebhook/);
  assert.match(developers, /\/summary/);
  assert.match(developers, /\/contributions/);
  assert.match(developers, /phase \d+/);
});
