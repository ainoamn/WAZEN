import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const files = ["app/documents/documents-client.tsx", "app/wazen-dashboard.tsx", "app/admin/admin-client.tsx", "components/personal/personal-wallet.tsx"];

test("frontend regression: no raw HTML injection or document.write sinks", () => {
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|document\.write\s*\(/, file);
  }
});

test("downloaded financial documents use escaping and an embedded CSP", () => {
  const source = fs.readFileSync(path.join(root, "app/documents/documents-client.tsx"), "utf8");
  const html = fs.readFileSync(path.join(root, "lib/html.ts"), "utf8");
  assert.match(source, /escapeHtml/);
  assert.match(source, /wrapPrintDocument/);
  assert.match(source, /safeDownloadFilename/);
  assert.match(html, /downloadedHtmlCsp/);
});

test("authenticated mutation clients use the CSRF-aware wrapper", () => {
  for (const file of ["app/wazen-dashboard.tsx", "app/admin/admin-client.tsx", "app/documents/documents-client.tsx", "app/invite/invite-client.tsx"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /apiFetch/, file);
  }
});

test("admin layout does not paint the console chrome before an access gate", () => {
  const layout = fs.readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
  const gate = fs.readFileSync(path.join(root, "app/admin/admin-gate.tsx"), "utf8");
  assert.match(layout, /AdminConsoleGate/);
  assert.doesNotMatch(layout, /AdminShell/);
  assert.match(gate, /canOpenPlatformConsole/);
  assert.match(gate, /admin-access-denied/);
  assert.match(gate, /لا تملك صلاحية دخول الإدارة/);
});

test("dashboard hides platform admin unless canOpenPlatformConsole is true", () => {
  const source = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  assert.match(source, /canOpenPlatformConsole\(role\) \? <a href="\/admin">/);
});

test("proxy redirects anonymous /admin visitors to login", () => {
  const source = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
  assert.match(source, /sessionToken/);
  assert.match(source, /\/login/);
  assert.match(source, /pathname.startsWith\("\/admin"\)/);
});
