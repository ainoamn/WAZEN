import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  activeCheckoutProvider,
  isOmanNetConfigured,
  mapOmanNetWebhook,
  mapThawaniWebhook,
} from "../lib/payment-checkout.ts";

const root = process.cwd();

test("OmanNet webhook mapper and provider selection helpers", () => {
  const paid = mapOmanNetWebhook({
    clientReferenceId: "pay-9",
    transactionId: "on-1",
    status: "captured",
  });
  assert.deepEqual(paid, { id: "omannet:on-1", paymentId: "pay-9", status: "succeeded" });
  assert.equal(mapOmanNetWebhook({ status: "paid" }), null);
  assert.equal(typeof isOmanNetConfigured(), "boolean");
  assert.ok(["thawani", "omannet", "manual_transfer"].includes(activeCheckoutProvider()));
  assert.ok(mapThawaniWebhook({ data: { client_reference_id: "a", payment_id: "b", payment_status: "paid" } }));
});

test("phase 7 cron tick and vercel crons exist", () => {
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const maintenance = fs.readFileSync(path.join(root, "lib/jobs-maintenance.ts"), "utf8");
  const jobAuth = fs.readFileSync(path.join(root, "lib/job-auth.ts"), "utf8");
  assert.match(tick, /runMaintenanceJob/);
  assert.match(tick, /processPushOutbox/);
  assert.match(tick, /drainEmail|EMAIL_PROVIDER/);
  assert.match(tick, /runDuesDigest/);
  assert.match(vercel, /"\/api\/jobs\/tick"/);
  assert.match(vercel, /"\*\/5 \* \* \* \*"/);
  assert.match(maintenance, /expireLapsedPaidSubscriptions/);
  assert.match(jobAuth, /CRON_SECRET/);
  assert.match(jobAuth, /WAZEN_JOB_SECRET/);
});
