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

test("dashboard and home keep a live revision poll without restarting it every render", () => {
  const live = fs.readFileSync(path.join(root, "lib/live-sync.ts"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  const home = fs.readFileSync(path.join(root, "app/home/home-client.tsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  const health = fs.readFileSync(path.join(root, "app/api/health/route.ts"), "utf8");
  assert.match(live, /view=revision/);
  assert.match(live, /onChangeRef/);
  assert.match(live, /LiveBuildGuard/);
  assert.match(live, /visibilityState/);
  assert.match(live, /DATA_POLL_MS = 12_000/);
  assert.match(live, /inflight/);
  assert.match(dashboard, /useLiveDashboard/);
  assert.match(home, /useLiveDashboard/);
  assert.match(route, /searchParams.get\("view"\) === "revision"/);
  assert.match(route, /filterSpacesForPlanAccess|filterSpacesByPlan/);
  assert.doesNotMatch(route, /getActivePlanEntitlements\(db, userId\)/);
  assert.match(route, /plan_stamp/);
  assert.match(health, /buildId/);
  assert.doesNotMatch(dashboard, /sidebarAllowsWalletView/);
});

test("pricing pays after select and schedules downgrades", () => {
  const pricing = fs.readFileSync(path.join(root, "app/pricing/pricing-client.tsx"), "utf8");
  const planChange = fs.readFileSync(path.join(root, "lib/plan-change.ts"), "utf8");
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  assert.match(pricing, /confirmInvoicePayment/);
  assert.match(pricing, /scheduled_downgrade/);
  assert.match(pricing, /errorLabel/);
  assert.match(planChange, /dayAfterIso/);
  assert.match(planChange, /upgrade_pending_payment/);
  assert.match(platform, /selectCustomerPlan/);
  assert.match(platform, /confirmInvoicePayment/);
});

test("customer billing uses account header and never links to admin plans", () => {
  const billing = fs.readFileSync(path.join(root, "app/billing/billing-client.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  const kit = fs.readFileSync(path.join(root, "app/commercial-kit.tsx"), "utf8");
  assert.match(billing, /AccountHeader/);
  assert.doesNotMatch(billing, /\/admin\/plans/);
  assert.match(billing, /href="\/pricing"/);
  assert.match(dashboard, /href="\/billing"/);
  assert.doesNotMatch(billing, /from ["'][^"']*lib\/plan-retention["']/);
  assert.doesNotMatch(dashboard, /from ["'][^"']*lib\/plan-retention["']/);
  assert.doesNotMatch(dashboard, /href="\/admin\/plans"/);
  assert.match(kit, /Signed-in header for customer commerce pages/);
  assert.match(kit, /never links to \/admin\/plans/);
  assert.match(kit, /function AccountHeader/);
  const accountHeader = kit.slice(kit.indexOf("function AccountHeader"), kit.indexOf("const adminLinks"));
  assert.match(accountHeader, /href="\/pricing"/);
  assert.match(accountHeader, /href="\/billing"/);
  assert.doesNotMatch(accountHeader, /\/admin\/plans/);
});

test("proxy redirects anonymous /admin visitors to login", () => {
  const source = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
  assert.match(source, /sessionToken/);
  assert.match(source, /\/login/);
  assert.match(source, /pathname.startsWith\("\/admin"\)/);
  assert.match(source, /pathname === "\/login"/);
  assert.match(source, /pathname === "\/home"/);
  assert.match(source, /pathname === "\/dashboard"/);
});

test("login page redirects when a session cookie is already present", () => {
  const login = fs.readFileSync(path.join(root, "app/login/page.tsx"), "utf8");
  const authRoute = fs.readFileSync(path.join(root, "app/api/auth/route.ts"), "utf8");
  const form = fs.readFileSync(path.join(root, "app/auth-form.tsx"), "utf8");
  assert.match(login, /redirect\(/);
  assert.match(login, /sessionCookieFromStore/);
  assert.match(authRoute, /SESSION_ALREADY_ACTIVE/);
  assert.match(form, /GoogleSignInButton/);
  assert.match(form, /أو المتابعة عبر/);
  const gsi = fs.readFileSync(path.join(root, "app/google-sign-in.tsx"), "utf8");
  assert.match(gsi, /\/api\/auth\/google/);
  assert.match(gsi, /idToken/);
});

test("logged-out sign-in does not paint the home load-error screen", () => {
  const kit = fs.readFileSync(path.join(root, "app/commercial-kit.tsx"), "utf8");
  const landing = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
  const homePage = fs.readFileSync(path.join(root, "app/home/page.tsx"), "utf8");
  const dashboardPage = fs.readFileSync(path.join(root, "app/dashboard/page.tsx"), "utf8");
  const home = fs.readFileSync(path.join(root, "app/home/home-client.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  const dashboardRoute = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  const publicHeader = kit.slice(kit.indexOf("export function PublicHeader"), kit.indexOf("export function AccountHeader"));
  assert.match(publicHeader, /href="\/login"/);
  assert.doesNotMatch(publicHeader, /href="\/home"/);
  assert.match(landing, /href="\/register"/);
  assert.doesNotMatch(landing, /href="\/home"/);
  assert.match(homePage, /redirect\("\/login\?next=\/home"\)/);
  assert.match(dashboardPage, /redirect\("\/login\?next=\/dashboard"\)/);
  assert.match(home, /let redirecting = false/);
  assert.match(home, /router\.replace\("\/login\?next=\/home"\)/);
  assert.match(home, /if \(!redirecting\) setLoading\(false\)/);
  assert.match(dashboard, /let redirecting = false/);
  assert.match(dashboard, /router\.replace\("\/login\?next=\/dashboard"\)/);
  assert.match(dashboardRoute, /unauthenticatedResponse/);
  assert.match(dashboardRoute, /clearSessionCookie/);
});

test("auth form redirects when a browser session is already active", () => {
  const auth = fs.readFileSync(path.join(root, "app/auth-form.tsx"), "utf8");
  const libAuth = fs.readFileSync(path.join(root, "lib/auth.ts"), "utf8");
  const sync = fs.readFileSync(path.join(root, "app/browser-session-sync.tsx"), "utf8");
  const browser = fs.readFileSync(path.join(root, "lib/browser-session.ts"), "utf8");
  assert.match(auth, /fetch\("\/api\/auth"/);
  assert.match(auth, /credentials: "same-origin"/);
  assert.match(auth, /result\.authenticated/);
  assert.match(auth, /router\.replace\(authRedirectTarget/);
  assert.match(auth, /notifyBrowserSessionChange/);
  assert.match(auth, /checkingSession/);
  assert.match(libAuth, /DELETE FROM auth_sessions WHERE browser_id=\?/);
  assert.match(browser, /browserIdCookieName/);
  assert.match(sync, /subscribeBrowserSessionChange/);
});
