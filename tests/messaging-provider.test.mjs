import assert from "node:assert/strict";
import test from "node:test";
import {
  isMessagingConfigured,
  isSmsProviderConfigured,
  isWhatsAppCloudConfigured,
} from "../lib/messaging-provider.ts";

test("messaging providers report not configured without env", () => {
  assert.equal(isWhatsAppCloudConfigured(), false);
  assert.equal(isSmsProviderConfigured(), false);
  assert.equal(isMessagingConfigured(), false);
});

test("schema and tick include message outbox drain", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const invite = fs.readFileSync(path.join(root, "lib/member-invite.ts"), "utf8");
  assert.match(runtime, /SCHEMA_VERSION = 25/);
  assert.match(runtime, /message_outbox/);
  assert.match(tick, /drainMessageOutbox/);
  assert.match(invite, /isWhatsAppCloudConfigured/);
  assert.match(invite, /isSmsProviderConfigured/);
  assert.match(invite, /channels/);
});
