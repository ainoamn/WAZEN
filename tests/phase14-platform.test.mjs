import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 14 documents write, settlements, periods markers", () => {
  const documents = fs.readFileSync(path.join(root, "app/api/v1/documents/route.ts"), "utf8");
  const createDoc = fs.readFileSync(path.join(root, "lib/v1-create-document.ts"), "utf8");
  const settlementsLib = fs.readFileSync(path.join(root, "lib/v1-settlements.ts"), "utf8");
  const periodsLib = fs.readFileSync(path.join(root, "lib/v1-periods.ts"), "utf8");
  const settlementsGet = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/settlements/route.ts"), "utf8");
  const settlePost = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/settlements/[settlementId]/settle/route.ts"), "utf8");
  const periods = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/periods/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");

  assert.match(documents, /export async function POST/);
  assert.match(documents, /createV1Document/);
  assert.match(createDoc, /createV1Document/);
  assert.match(settlementsLib, /settleV1Settlement/);
  assert.match(settlementsLib, /listV1Settlements/);
  assert.match(periodsLib, /closeV1Period/);
  assert.match(periodsLib, /PERIOD_UNSETTLED/);
  assert.match(settlementsGet, /listV1Settlements/);
  assert.match(settlePost, /settleV1Settlement/);
  assert.match(periods, /closeV1Period/);
  assert.match(hooks, /document\.created/);
  assert.match(hooks, /settlement\.settled/);
  assert.match(hooks, /period\.closed/);
  assert.match(openapi, /1\.0\.0-phase\d+/);
  assert.match(developers, /\/settlements/);
  assert.match(developers, /\/periods/);
  assert.match(developers, /phase \d+/);
});
