import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("google oauth supports Hisaby-style GIS id tokens without a client secret", () => {
  const oauth = fs.readFileSync(path.join(root, "lib/google-oauth.ts"), "utf8");
  const idToken = fs.readFileSync(path.join(root, "lib/google-id-token.ts"), "utf8");
  const start = fs.readFileSync(path.join(root, "app/api/auth/google/route.ts"), "utf8");
  const callback = fs.readFileSync(path.join(root, "app/api/auth/google/callback/route.ts"), "utf8");
  const account = fs.readFileSync(path.join(root, "lib/google-account.ts"), "utf8");
  const form = fs.readFileSync(path.join(root, "app/auth-form.tsx"), "utf8");
  const gsi = fs.readFileSync(path.join(root, "app/google-sign-in.tsx"), "utf8");
  assert.match(oauth, /code_challenge_method/);
  assert.match(oauth, /GOOGLE_CLIENT_ID/);
  assert.match(oauth, /HISABY_COMPAT_CLIENT_ID/);
  assert.match(oauth, /isGoogleOAuthConfigured/);
  assert.match(oauth, /isGoogleRedirectConfigured/);
  assert.match(idToken, /verifyGoogleIdToken/);
  assert.match(idToken, /RSASSA-PKCS1-v1_5/);
  assert.match(idToken, /verifyGoogleAccessToken/);
  assert.match(start, /export async function POST/);
  assert.match(start, /verifyGoogleIdToken/);
  assert.match(callback, /exchangeGoogleCode/);
  assert.match(account, /oauth_identities/);
  assert.match(form, /GoogleSignInButton/);
  assert.match(gsi, /accounts\.google\.com\/gsi\/client/);
  assert.match(gsi, /openid email profile/);
});
