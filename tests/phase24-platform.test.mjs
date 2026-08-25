import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 24 occurrence queue, assign account, and defer", () => {
  const occLib = fs.readFileSync(path.join(root, "lib/v1-occurrences.ts"), "utf8");
  const queue = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/occurrences/route.ts"), "utf8");
  const assign = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/occurrences/[occurrenceId]/route.ts"), "utf8");
  const defer = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/occurrences/[occurrenceId]/defer/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(occLib, /queueV1PersonalOccurrence/);
  assert.match(occLib, /assignV1PersonalOccurrenceAccount/);
  assert.match(occLib, /deferV1PersonalOccurrence/);
  assert.match(queue, /queueV1PersonalOccurrence/);
  assert.match(assign, /assignV1PersonalOccurrenceAccount/);
  assert.match(assign, /export async function PATCH/);
  assert.match(defer, /deferV1PersonalOccurrence/);
  assert.match(hooks, /occurrence\.queued/);
  assert.match(hooks, /occurrence\.updated/);
  assert.match(hooks, /occurrence\.deferred/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/occurrences\"/);
  assert.match(openapi, /\/occurrences\/\{occurrenceId\}/);
  assert.match(openapi, /\/defer/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /\/occurrences\"/);
  assert.match(developers, /\/defer/);
  assert.match(security, /occurrence\.queued/);
  assert.match(security, /occurrence\.deferred/);
});
