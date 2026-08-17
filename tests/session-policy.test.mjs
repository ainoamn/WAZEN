import assert from "node:assert/strict";
import test from "node:test";
import { browserCsrfCookie, browserSessionCookie, idleCutoffIso, isSessionIdle, SESSION_IDLE_MS } from "../lib/session-policy.ts";

test("session cookies are browser-session cookies without Expires or Max-Age", () => {
  const session = browserSessionCookie("token-value");
  const csrf = browserCsrfCookie("csrf-value");
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.doesNotMatch(session, /Expires=/i);
  assert.doesNotMatch(session, /Max-Age=/i);
  assert.doesNotMatch(csrf, /Expires=/i);
  assert.doesNotMatch(csrf, /Max-Age=/i);
  assert.match(csrf, /SameSite=Strict/);
});

test("idle cut-off is ten minutes and fails closed on missing timestamps", () => {
  assert.equal(SESSION_IDLE_MS, 10 * 60 * 1000);
  const now = Date.parse("2026-08-17T12:00:00.000Z");
  assert.equal(isSessionIdle(new Date(now - SESSION_IDLE_MS + 1_000).toISOString(), now), false);
  assert.equal(isSessionIdle(new Date(now - SESSION_IDLE_MS - 1).toISOString(), now), true);
  assert.equal(isSessionIdle(null, now), true);
  assert.equal(isSessionIdle("not-a-date", now), true);
  assert.equal(Date.parse(idleCutoffIso(now)), now - SESSION_IDLE_MS);
});
