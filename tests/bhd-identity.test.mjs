import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BHD_OAUTH_CLIENT_ID,
  DEFAULT_BHD_IDENTITY_ISSUER,
  decodeBhdOauthState,
  encodeBhdOauthState,
  identityIssuer,
  isBhdIdentityConfigured,
  pkceChallenge,
  safeReturnTo,
  verifyBhdIdToken,
  verifyHs256Jwt,
} from "../lib/bhd-identity.ts";

const root = process.cwd();

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signHs256(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

test("BHD identity helpers keep the frozen Wazen client and reject unsafe returnTo", async () => {
  assert.equal(BHD_OAUTH_CLIENT_ID, "bhd-wazen");
  assert.equal(DEFAULT_BHD_IDENTITY_ISSUER, "https://id.bhd-om.com");
  assert.equal(safeReturnTo("/dashboard"), "/dashboard");
  assert.equal(safeReturnTo("/home"), "/home");
  assert.equal(safeReturnTo("https://evil.example/"), "/home");
  assert.equal(safeReturnTo("//evil.example"), "/home");
  assert.equal(safeReturnTo(null), "/home");
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV";
  const challenge = await pkceChallenge(verifier);
  assert.equal(challenge.length > 40, true);
  assert.doesNotMatch(challenge, /[+/=]/);
  const packed = encodeBhdOauthState({ state: "s", nonce: "n", verifier, returnTo: "/billing" });
  assert.deepEqual(decodeBhdOauthState(packed), { state: "s", nonce: "n", verifier, returnTo: "/billing" });
});

test("BHD identity is off until the client secret is set", () => {
  const previous = {
    issuer: process.env.BHD_IDENTITY_ISSUER,
    id: process.env.BHD_OAUTH_CLIENT_ID,
    secret: process.env.BHD_OAUTH_CLIENT_SECRET,
  };
  delete process.env.BHD_OAUTH_CLIENT_SECRET;
  process.env.BHD_IDENTITY_ISSUER = DEFAULT_BHD_IDENTITY_ISSUER;
  process.env.BHD_OAUTH_CLIENT_ID = BHD_OAUTH_CLIENT_ID;
  assert.equal(isBhdIdentityConfigured(), false);
  assert.equal(identityIssuer(), DEFAULT_BHD_IDENTITY_ISSUER);
  process.env.BHD_OAUTH_CLIENT_SECRET = previous.secret;
  process.env.BHD_IDENTITY_ISSUER = previous.issuer;
  process.env.BHD_OAUTH_CLIENT_ID = previous.id;
  if (!previous.secret) delete process.env.BHD_OAUTH_CLIENT_SECRET;
  if (!previous.issuer) delete process.env.BHD_IDENTITY_ISSUER;
  if (!previous.id) delete process.env.BHD_OAUTH_CLIENT_ID;
});

test("ID token HS256 verification checks iss, aud, nonce, and expiry", async () => {
  const secret = "wazen-identity-test-secret";
  const previous = { ...process.env };
  process.env.BHD_IDENTITY_ISSUER = DEFAULT_BHD_IDENTITY_ISSUER;
  process.env.BHD_OAUTH_CLIENT_ID = BHD_OAUTH_CLIENT_ID;
  process.env.BHD_IDENTITY_TOKEN_SECRET = secret;
  const nonce = "nonce-value-from-cookie";
  const token = signHs256({
    iss: DEFAULT_BHD_IDENTITY_ISSUER,
    aud: BHD_OAUTH_CLIENT_ID,
    sub: "11111111-1111-4111-8111-111111111111",
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce,
    email: "user@example.com",
    email_verified: true,
    name: "User",
  }, secret);
  assert.equal(await verifyHs256Jwt(token, secret), true);
  const claims = await verifyBhdIdToken(token, nonce);
  assert.equal(claims.sub, "11111111-1111-4111-8111-111111111111");
  assert.equal(claims.email, "user@example.com");

  const otherAud = signHs256({
    iss: DEFAULT_BHD_IDENTITY_ISSUER,
    aud: "bhd-hisaby",
    sub: "11111111-1111-4111-8111-111111111111",
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce,
    email: "user@example.com",
    email_verified: true,
  }, secret);
  await assert.rejects(() => verifyBhdIdToken(otherAud, nonce), /BHD_TOKEN_INVALID/);

  const wrongNonce = signHs256({
    iss: DEFAULT_BHD_IDENTITY_ISSUER,
    aud: BHD_OAUTH_CLIENT_ID,
    sub: "11111111-1111-4111-8111-111111111111",
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: "different",
    email: "user@example.com",
    email_verified: true,
  }, secret);
  await assert.rejects(() => verifyBhdIdToken(wrongNonce, nonce), /BHD_NONCE_MISMATCH/);

  process.env.BHD_IDENTITY_ISSUER = previous.BHD_IDENTITY_ISSUER;
  process.env.BHD_OAUTH_CLIENT_ID = previous.BHD_OAUTH_CLIENT_ID;
  process.env.BHD_IDENTITY_TOKEN_SECRET = previous.BHD_IDENTITY_TOKEN_SECRET;
  if (!previous.BHD_IDENTITY_ISSUER) delete process.env.BHD_IDENTITY_ISSUER;
  if (!previous.BHD_OAUTH_CLIENT_ID) delete process.env.BHD_OAUTH_CLIENT_ID;
  if (!previous.BHD_IDENTITY_TOKEN_SECRET) delete process.env.BHD_IDENTITY_TOKEN_SECRET;
});

test("Wazen BHD routes follow the product card in the identity spec", () => {
  const spec = fs.readFileSync(path.join(root, "docs/BHD-IDENTITY-SSO.md"), "utf8");
  const identity = fs.readFileSync(path.join(root, "lib/bhd-identity.ts"), "utf8");
  const start = fs.readFileSync(path.join(root, "app/api/auth/bhd/start/route.ts"), "utf8");
  const callback = fs.readFileSync(path.join(root, "app/api/auth/bhd/callback/route.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const account = fs.readFileSync(path.join(root, "lib/bhd-account.ts"), "utf8");
  const auth = fs.readFileSync(path.join(root, "app/api/auth/route.ts"), "utf8");
  assert.match(spec, /bhd-identity\.v1/);
  assert.match(spec, /bhd-wazen/);
  assert.match(spec, /https:\/\/id\.bhd-om\.com/);
  assert.match(start, /createBhdAuthRequest/);
  assert.match(identity, /oauth\/authorize/);
  assert.match(identity, /code_challenge_method/);
  assert.match(callback, /exchangeBhdCode/);
  assert.match(callback, /upsertBhdUser/);
  assert.match(runtime, /SCHEMA_VERSION = 13/);
  assert.match(runtime, /bhd_sub/);
  assert.match(account, /bhd_sub/);
  assert.doesNotMatch(account, /super_admin/);
  assert.match(auth, /endSessionUrl/);
});
