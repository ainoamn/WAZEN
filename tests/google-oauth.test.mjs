import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("google oauth start and callback routes exist with PKCE", () => {
  const oauth = fs.readFileSync(path.join(root, "lib/google-oauth.ts"), "utf8");
  const start = fs.readFileSync(path.join(root, "app/api/auth/google/route.ts"), "utf8");
  const callback = fs.readFileSync(path.join(root, "app/api/auth/google/callback/route.ts"), "utf8");
  const account = fs.readFileSync(path.join(root, "lib/google-account.ts"), "utf8");
  const form = fs.readFileSync(path.join(root, "app/auth-form.tsx"), "utf8");
  assert.match(oauth, /code_challenge_method/);
  assert.match(oauth, /GOOGLE_CLIENT_ID/);
  assert.match(oauth, /wazen_oauth=/);
  assert.match(oauth, /GOOGLE_CLIENT_SECRET/);
  assert.match(oauth, /appOrigin\(request\)/);
  assert.match(oauth, /value\?\.startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
  assert.match(start, /createGoogleOAuthRequest/);
  assert.match(callback, /exchangeGoogleCode/);
  assert.match(callback, /cookieState !== state/);
  assert.match(account, /oauth_identities/);
  assert.match(account, /GOOGLE_EMAIL_UNVERIFIED/);
  assert.match(form, /\/api\/auth\/google/);
  assert.match(form, /أو المتابعة عبر/);
});
