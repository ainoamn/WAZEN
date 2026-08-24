import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 10 privacy fulfillment and v1 invites markers", () => {
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "lib/privacy-requests.ts"), "utf8");
  const invites = fs.readFileSync(path.join(root, "lib/v1-invites.ts"), "utf8");
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const inviteRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/invites/route.ts"), "utf8");
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  const ui = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");

  assert.match(runtime, /SCHEMA_VERSION = 20/);
  assert.match(runtime, /privacy_artifacts/);
  assert.match(runtime, /artifact_id TEXT/);
  assert.match(privacy, /processPrivacyRequests/);
  assert.match(privacy, /fulfillExport|privacy_export_ready/);
  assert.match(privacy, /privacy\.deletion_completed/);
  assert.match(tick, /processPrivacyRequests/);
  assert.match(tick, /hour === 3/);
  assert.match(invites, /createV1Invite/);
  assert.match(inviteRoute, /createV1Invite/);
  assert.match(inviteRoute, /export async function POST/);
  assert.match(platform, /view === "privacyRequests"/);
  assert.match(platform, /view === "privacyExport"/);
  assert.match(ui, /requestDataExport/);
  assert.match(ui, /requestDeletion/);
  assert.match(developers, /\/invites/);
});
