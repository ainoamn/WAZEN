import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { withRequestTiming } from "../lib/request-timing.ts";

const root = process.cwd();

test("withRequestTiming adds X-Response-Time header", async () => {
  const response = await withRequestTiming("test", async () =>
    Response.json({ ok: true }, { headers: { "X-Wazen-Api": "v1" } }),
  );
  assert.equal(response.headers.get("X-Wazen-Api"), "v1");
  assert.match(String(response.headers.get("X-Response-Time")), /^\d+ms$/);
  assert.match(String(response.headers.get("Server-Timing")), /test;dur=\d+/);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test("phase 9 dues digest, members POST, audit search markers", () => {
  const dues = fs.readFileSync(path.join(root, "lib/dues-digest.ts"), "utf8");
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const members = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/members/route.ts"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  const ui = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  assert.match(dues, /runDuesDigest/);
  assert.match(dues, /dues_digest_log/);
  assert.match(tick, /runDuesDigest/);
  assert.match(tick, /hour === 6/);
  assert.match(members, /createV1Member/);
  assert.match(members, /export async function POST/);
  assert.match(dashboard, /q: z\.string/);
  assert.match(ui, /auditQuery/);
});
