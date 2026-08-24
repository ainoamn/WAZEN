import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 23 rule update/delete and occurrence confirm/skip", () => {
  const rulesLib = fs.readFileSync(path.join(root, "lib/v1-rules.ts"), "utf8");
  const occLib = fs.readFileSync(path.join(root, "lib/v1-occurrences.ts"), "utf8");
  const ruleRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/rules/[ruleId]/route.ts"), "utf8");
  const confirm = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/occurrences/[occurrenceId]/confirm/route.ts"), "utf8");
  const skip = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/occurrences/[occurrenceId]/skip/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(rulesLib, /updateV1PersonalRule/);
  assert.match(rulesLib, /deleteV1PersonalRule/);
  assert.match(occLib, /confirmV1PersonalOccurrence/);
  assert.match(occLib, /skipV1PersonalOccurrence/);
  assert.match(ruleRoute, /export async function PATCH/);
  assert.match(ruleRoute, /export async function DELETE/);
  assert.match(confirm, /confirmV1PersonalOccurrence/);
  assert.match(skip, /skipV1PersonalOccurrence/);
  assert.match(hooks, /rule\.updated/);
  assert.match(hooks, /rule\.deleted/);
  assert.match(hooks, /occurrence\.posted/);
  assert.match(hooks, /occurrence\.skipped/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(openapi, /\/rules\/\{ruleId\}/);
  assert.match(openapi, /\/occurrences\/\{occurrenceId\}\/confirm/);
  assert.match(openapi, /\/occurrences\/\{occurrenceId\}\/skip/);
  assert.match(developers, /phase \d+/);
  assert.match(developers, /\/rules\/\{ruleId\}/);
  assert.match(developers, /\/occurrences\//);
  assert.match(security, /occurrence\.posted/);
  assert.match(security, /rule\.deleted/);
});
