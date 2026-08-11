import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the branded bilingual Wazen landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>وازن \| إدارة أموالك بوضوح<\/title>/i);
  assert.match(html, /commerce-landing/);
  assert.match(html, /وازن/);
  assert.match(html, /WAZEN/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships the commercial finance platform and durable storage configuration", async () => {
  const [page, dashboardPage, dashboard, schema, platformApi, documents, admin, pricing, hosting, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/dashboard/page.tsx", root), "utf8"),
    readFile(new URL("app/wazen-dashboard.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/platform/route.ts", root), "utf8"),
    readFile(new URL("app/documents/documents-client.tsx", root), "utf8"),
    readFile(new URL("app/admin/admin-client.tsx", root), "utf8"),
    readFile(new URL("app/pricing/pricing-client.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(page, /commerce-landing/);
  assert.match(dashboardPage, /WazenDashboard/);
  assert.match(dashboard, /personal_reserve/);
  assert.match(dashboard, /Family trip/);
  assert.match(dashboard, /inviteMember/);
  assert.match(schema, /contributionPlans/);
  assert.match(schema, /subscriptions/);
  assert.match(schema, /documents/);
  assert.match(schema, /auditLogs/);
  assert.match(platformApi, /assertAdmin/);
  assert.match(platformApi, /nextDocumentReference/);
  assert.match(documents, /window\.print/);
  assert.match(admin, /Annual recurring revenue/);
  assert.match(pricing, /validateCoupon/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
