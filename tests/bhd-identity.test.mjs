import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BHD_IDENTITY_VERCEL_ORIGIN,
  BHD_OAUTH_CLIENT_ID,
  DEFAULT_BHD_IDENTITY_ISSUER,
  decodeBhdOauthState,
  encodeBhdOauthState,
  identityAuthorizeProbeAllows,
  identityEndpointBase,
  identityIssuer,
  isBhdIdentityConfigured,
  isBhdSsoReadyForOrigin,
  pkceChallenge,
  signInEntryPathForOrigin,
  signInEntryPath,
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
  assert.equal(BHD_IDENTITY_VERCEL_ORIGIN, "https://one-bhd.vercel.app");
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

test("BHD identity is on with frozen client id; secret is optional for first-party PKCE", () => {
  const previous = {
    issuer: process.env.BHD_IDENTITY_ISSUER,
    endpoint: process.env.BHD_IDENTITY_ENDPOINT,
    id: process.env.BHD_OAUTH_CLIENT_ID,
    secret: process.env.BHD_OAUTH_CLIENT_SECRET,
    disabled: process.env.BHD_OAUTH_DISABLED,
  };
  delete process.env.BHD_OAUTH_CLIENT_SECRET;
  delete process.env.BHD_OAUTH_DISABLED;
  delete process.env.BHD_IDENTITY_ISSUER;
  delete process.env.BHD_IDENTITY_ENDPOINT;
  process.env.BHD_OAUTH_CLIENT_ID = BHD_OAUTH_CLIENT_ID;
  assert.equal(isBhdIdentityConfigured(), true);
  assert.equal(identityIssuer(), DEFAULT_BHD_IDENTITY_ISSUER);
  assert.equal(identityEndpointBase(), BHD_IDENTITY_VERCEL_ORIGIN);
  process.env.BHD_IDENTITY_ISSUER = DEFAULT_BHD_IDENTITY_ISSUER;
  assert.equal(identityEndpointBase(), BHD_IDENTITY_VERCEL_ORIGIN);
  process.env.BHD_IDENTITY_ENDPOINT = BHD_IDENTITY_VERCEL_ORIGIN;
  process.env.BHD_IDENTITY_ISSUER = "https://id.example.invalid";
  assert.equal(identityEndpointBase(), BHD_IDENTITY_VERCEL_ORIGIN);
  assert.equal(identityAuthorizeProbeAllows(307), true);
  assert.equal(identityAuthorizeProbeAllows(302), true);
  assert.equal(identityAuthorizeProbeAllows(400), false);
  assert.equal(identityAuthorizeProbeAllows(401), false);
  process.env.BHD_OAUTH_DISABLED = "1";
  assert.equal(isBhdIdentityConfigured(), false);
  process.env.BHD_OAUTH_CLIENT_SECRET = previous.secret;
  process.env.BHD_IDENTITY_ISSUER = previous.issuer;
  process.env.BHD_IDENTITY_ENDPOINT = previous.endpoint;
  process.env.BHD_OAUTH_CLIENT_ID = previous.id;
  process.env.BHD_OAUTH_DISABLED = previous.disabled;
  if (!previous.secret) delete process.env.BHD_OAUTH_CLIENT_SECRET;
  if (!previous.issuer) delete process.env.BHD_IDENTITY_ISSUER;
  if (!previous.endpoint) delete process.env.BHD_IDENTITY_ENDPOINT;
  if (!previous.id) delete process.env.BHD_OAUTH_CLIENT_ID;
  if (!previous.disabled) delete process.env.BHD_OAUTH_DISABLED;
});

test("BHD SSO readiness follows allowlisted production origins", () => {
  const previous = { ...process.env };
  delete process.env.BHD_SSO_READY;
  process.env.BHD_OAUTH_CLIENT_ID = BHD_OAUTH_CLIENT_ID;
  assert.equal(isBhdSsoReadyForOrigin("https://wazen.bhd-om.com"), true);
  assert.equal(isBhdSsoReadyForOrigin("https://wazen-roan.vercel.app"), false);
  assert.equal(isBhdSsoReadyForOrigin("http://localhost:3000"), true);
  process.env.BHD_SSO_READY = "1";
  assert.equal(isBhdSsoReadyForOrigin("https://wazen-roan.vercel.app"), true);
  process.env.BHD_SSO_READY = "0";
  assert.equal(isBhdSsoReadyForOrigin("https://wazen.bhd-om.com"), false);
  Object.assign(process.env, previous);
  if (!previous.BHD_SSO_READY) delete process.env.BHD_SSO_READY;
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

test("signInEntryPathForOrigin routes SSO vs local login by origin", () => {
  const previous = { ...process.env };
  delete process.env.BHD_SSO_READY;
  process.env.BHD_OAUTH_CLIENT_ID = BHD_OAUTH_CLIENT_ID;
  assert.match(signInEntryPathForOrigin("/home", "https://wazen.bhd-om.com"), /^\/api\/auth\/bhd\/start\?next=/);
  assert.match(signInEntryPathForOrigin("/home", "https://wazen-roan.vercel.app"), /^\/login\?local=1&next=/);
  Object.assign(process.env, previous);
  if (!previous.BHD_SSO_READY) delete process.env.BHD_SSO_READY;
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
  assert.match(start, /isBhdSsoReadyForRequest/);
  assert.match(start, /returnTo/);
  assert.match(identity, /isBhdSsoReadyForOrigin/);
  assert.match(identity, /signInEntryPathForOrigin/);
  assert.match(identity, /signInEntryPath/);
  assert.match(identity, /oauth\/authorize/);
  assert.match(identity, /code_challenge_method/);
  assert.match(callback, /exchangeBhdCode/);
  assert.match(callback, /upsertBhdUser/);
  assert.match(runtime, /SCHEMA_VERSION = 13/);
  assert.match(runtime, /bhd_sub/);
  assert.match(runtime, /await ensureBhdSubColumn\(db\)/);
  const currentPath = runtime.slice(
    runtime.indexOf("if (row && Number(row.version) >= SCHEMA_VERSION)"),
    runtime.indexOf("schema_meta missing"),
  );
  assert.doesNotMatch(currentPath, /ensureBhdSubColumn/);
  assert.match(account, /bhd_sub/);
  assert.doesNotMatch(account, /super_admin/);
  assert.match(account, /ensureBootstrapPlatformRole/);
  assert.match(account, /claims\.emailVerified/);
  assert.match(auth, /endSessionUrl/);
});
