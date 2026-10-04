import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { persistentCsrfCookie, persistentSessionCookie, SESSION_MAX_AGE_SEC, SESSION_MAX_MS, sessionCookieFromStore, sessionCookieName } from "../lib/session-policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("product session cookie is fixed 400 days, HttpOnly, Lax, host-only", () => {
  const session = persistentSessionCookie("token-value");
  const csrf = persistentCsrfCookie("csrf-value");
  assert.equal(SESSION_MAX_AGE_SEC, 34_560_000);
  assert.equal(SESSION_MAX_MS, 400 * 24 * 60 * 60 * 1000);
  assert.match(session, /Max-Age=34560000/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /Path=\//);
  assert.doesNotMatch(session, /Domain=/i);
  assert.match(csrf, /Max-Age=34560000/);
  assert.match(csrf, /SameSite=Strict/);
  assert.doesNotMatch(csrf, /Domain=/i);
  assert.doesNotMatch(csrf, /HttpOnly/);
});

test("sessionCookieFromStore reads current and legacy cookie names", () => {
  const name = sessionCookieName();
  assert.equal(sessionCookieFromStore({ get: (key) => key === name ? { value: "live" } : undefined }), "live");
  assert.equal(sessionCookieFromStore({ get: (key) => key === "wazen_session" ? { value: "legacy" } : undefined }), "legacy");
  assert.equal(sessionCookieFromStore({ get: () => undefined }), "");
});

test("BHD session policy: no idle timeout, keep-alive, or cookie renewal", () => {
  const policy = read("lib/session-policy.ts");
  assert.doesNotMatch(policy, /SESSION_IDLE|isSessionIdle|idleCutoff/);
  assert.equal(fs.existsSync(path.join(root, "components/auth/SessionKeepAlive.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "app/session-idle-guard.tsx")), false);
  assert.doesNotMatch(read("app/providers.tsx"), /SessionKeepAlive|SessionIdleGuard/);

  const me = read("app/api/auth/me/route.ts");
  assert.doesNotMatch(me, /Set-Cookie|issueCsrfToken|csrfCookie|clearSessionCookie/);

  const proxy = read("proxy.ts");
  assert.doesNotMatch(proxy, /Set-Cookie/);

  const auth = read("lib/auth.ts");
  assert.doesNotMatch(auth, /last_seen_at>\?/);
  assert.doesNotMatch(read("lib/jobs-maintenance.ts"), /last_seen_at<=/);
});

test("BHD session policy: no reload/refresh on tab return and no Google One Tap", () => {
  const sync = read("app/browser-session-sync.tsx");
  assert.doesNotMatch(sync, /visibilitychange|"focus"|pageshow/);
  const live = read("lib/live-sync.ts");
  const guard = live.slice(live.indexOf("export function LiveBuildGuard"), live.indexOf("export function useLiveDashboard"));
  assert.doesNotMatch(guard, /location\.reload|router\.refresh|visibilitychange|pageshow|"focus"/);
  assert.equal(fs.existsSync(path.join(root, "app/google-sign-in.tsx")), false);
  for (const file of ["app/auth-form.tsx", "app/login/page.tsx", "app/register/page.tsx"]) {
    assert.doesNotMatch(read(file), /accounts\.google\.com\/gsi|GoogleSignInButton|auto_select|useOneTap|googleClientId/);
  }
});
