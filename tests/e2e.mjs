import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "wazen-e2e-"));
const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); }); });
const origin = `http://127.0.0.1:${port}`;
const webhookSecret = "e2e-payment-webhook-secret-with-at-least-32-bytes";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
let logs = "";
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "development", WAZEN_DEMO_MODE: "1", WAZEN_USE_NODE_SQLITE: "1", WAZEN_TRUST_OAI_HEADERS: "1", WAZEN_SQLITE_PATH: path.join(temporary, "e2e.sqlite"), WAZEN_APP_ORIGIN: origin, WAZEN_PAYMENT_WEBHOOK_SECRET: webhookSecret },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { logs = (logs + chunk).slice(-20_000); }); server.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-20_000); });

const waitForServer = async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next exited early\n${logs}`);
    try { const response = await fetch(`${origin}/api/platform?view=pricing`); if (response.ok) return; } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Next did not start\n${logs}`);
};

const identity = (id, email) => ({ "oai-authenticated-user-id": id, "oai-authenticated-user-email": email, "oai-authenticated-user-full-name": encodeURIComponent(id), "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" });
const post = (url, body, headers = {}) => fetch(`${origin}${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

try {
  await waitForServer();
  const userA = identity("tenant-a-user", "a@example.test"); const userB = identity("tenant-b-user", "b@example.test");
  const key = randomUUID();
  const created = await post("/api/dashboard", { action: "addWallet", idempotencyKey: key, name: "Tenant A wallet", type: "personal", goal: "100.00" }, userA);
  const createdText = await created.text(); assert.equal(created.status, 200, createdText); const wallet = JSON.parse(createdText).spaces.at(-1);
  const replay = await post("/api/dashboard", { action: "addWallet", idempotencyKey: key, name: "Tenant A wallet", type: "personal", goal: "100.00" }, userA);
  assert.equal(replay.status, 200);
  const reused = await post("/api/dashboard", { action: "addMember", idempotencyKey: key, spaceId: wallet.id, displayName: "Wrong action" }, userA);
  assert.equal(reused.status, 409);

  const crossTenant = await post("/api/dashboard", { action: "addTransaction", idempotencyKey: randomUUID(), spaceId: wallet.id, kind: "income", allocation: "general", amount: "1.00", description: "cross tenant" }, userB);
  assert.equal(crossTenant.status, 404, "a different tenant must not discover or mutate the wallet");

  const documents = await Promise.all(Array.from({ length: 8 }, (_, index) => post("/api/platform", { action: "createDocument", idempotencyKey: randomUUID(), type: "receipt", personName: `Person ${index}`, description: `<img src=x onerror=alert(${index})>`, amount: "1.00", spaceId: wallet.id }, userA)));
  assert.ok(documents.every((response) => response.status === 200));
  const references = await Promise.all(documents.map(async (response) => (await response.json()).document.reference));
  assert.equal(new Set(references).size, references.length, "concurrent references must be unique");

  const billing = await fetch(`${origin}/api/platform?view=billing`); assert.equal(billing.status, 200);
  const eventBodies = [
    JSON.stringify({ id: "evt_concurrent_success", paymentId: "demo-pay-3", status: "succeeded" }),
    JSON.stringify({ id: "evt_concurrent_failure", paymentId: "demo-pay-3", status: "failed" }),
  ];
  const webhookCall = (body) => fetch(`${origin}/api/webhooks/payment`, { method: "POST", headers: { "content-type": "application/json", "x-wazen-signature": createHmac("sha256", webhookSecret).update(body).digest("hex") }, body });
  const webhookResponses = await Promise.all(eventBodies.map(webhookCall));
  assert.deepEqual(webhookResponses.map((response) => response.status).sort(), [200, 409], "only one conflicting transition may win");
  const winningBody = eventBodies[webhookResponses.findIndex((response) => response.status === 200)];
  assert.equal((await webhookCall(winningBody)).status, 200, "the winning event must be replay-safe");

  const publicInvoice = await fetch(`${origin}/api/invoices/public/not-a-token`);
  assert.equal(publicInvoice.status, 404, "no unauthenticated invoice payload is exposed");
  console.log("Wazen E2E: idempotency, tenant isolation, reference concurrency, webhook race and public invoice exposure passed.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 5_000); } });
  fs.rmSync(temporary, { recursive: true, force: true });
}
