import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { activeCheckoutProvider, isThawaniConfigured, mapThawaniWebhook } from "../lib/payment-checkout.ts";

const root = process.cwd();

test("Thawani webhook mapper accepts paid and failed statuses", () => {
  const paid = mapThawaniWebhook({
    data: { client_reference_id: "pay-1", payment_id: "th_1", payment_status: "paid" },
  });
  assert.deepEqual(paid, { id: "thawani:th_1", paymentId: "pay-1", status: "succeeded" });

  const failed = mapThawaniWebhook({
    client_reference_id: "pay-2",
    session_id: "sess-2",
    status: "cancelled",
  });
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.paymentId, "pay-2");

  assert.equal(mapThawaniWebhook({ status: "unknown" }), null);
  assert.equal(typeof isThawaniConfigured(), "boolean");
  assert.ok(["thawani", "manual_transfer"].includes(activeCheckoutProvider()));
});

test("phase 6 routes and schema markers exist", () => {
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const pushJob = fs.readFileSync(path.join(root, "app/api/jobs/push/route.ts"), "utf8");
  const txnRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/transactions/route.ts"), "utf8");
  assert.match(runtime, /SCHEMA_VERSION = 2\d/);
  assert.match(runtime, /push_outbox/);
  assert.match(runtime, /job_runs/);
  assert.match(runtime, /dues_digest_log/);
  assert.match(pushJob, /processPushOutbox/);
  assert.match(txnRoute, /export async function POST/);
  assert.match(txnRoute, /createV1Transaction/);
});
