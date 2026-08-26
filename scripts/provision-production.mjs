#!/usr/bin/env node
/**
 * Provisions Turso DB, writes Vercel production env, migrates, and mints admin bootstrap URL.
 *
 * Required env:
 *   TURSO_API_TOKEN  — platform API token (mint via Turso dashboard/CLI)
 *   TURSO_ORG        — organization slug
 *
 * Optional:
 *   TURSO_GROUP=default
 *   TURSO_DATABASE=wazen-production-v1
 *   WAZEN_ADMIN_EMAIL=a.hamid89@hotmail.com
 *   WAZEN_ADMIN_NAME=Wazen Admin
 *   WAZEN_APP_ORIGIN=https://wazen-roan.vercel.app
 *
 * Usage:
 *   set TURSO_API_TOKEN=... & set TURSO_ORG=... & npm run provision:production
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const apiToken = process.env.TURSO_API_TOKEN;
const org = process.env.TURSO_ORG;
const group = process.env.TURSO_GROUP ?? "default";
const database = process.env.TURSO_DATABASE ?? "wazen-production-v1";
const adminEmail = (process.env.WAZEN_ADMIN_EMAIL ?? "a.hamid89@hotmail.com").trim().toLowerCase();
const adminName = process.env.WAZEN_ADMIN_NAME ?? "Wazen Admin";
const origin = (process.env.WAZEN_APP_ORIGIN ?? "https://wazen-roan.vercel.app").replace(/\/$/, "");

if (!apiToken || !org) {
  console.error(`Missing TURSO_API_TOKEN or TURSO_ORG.

Create a Turso API token, then run:
  $env:TURSO_API_TOKEN="..."
  $env:TURSO_ORG="your-org-slug"
  npm run provision:production
`);
  process.exit(1);
}

async function turso(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.turso.tech/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const err = new Error(`Turso API ${method} ${path} -> ${response.status}`);
    err.details = json;
    throw err;
  }
  return json;
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
  return result.stdout;
}

function vercelEnvSet(name, value) {
  const result = spawnSync("npx", ["vercel", "env", "add", name, "production", "--force", "--sensitive"], {
    input: `${value}\n`,
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Failed to set Vercel env ${name}`);
  }
  console.log(`vercel env: ${name}`);
}

console.log(`Provisioning Turso database ${database} in org=${org} group=${group}`);

const listed = await turso(`/organizations/${org}/databases`);
const existing = (listed?.databases ?? listed ?? []).find?.((row) => row.Name === database || row.name === database)
  ?? (Array.isArray(listed?.databases) ? listed.databases.find((row) => (row.Name ?? row.name) === database) : null);

if (!existing) {
  await turso(`/organizations/${org}/databases`, {
    method: "POST",
    body: { name: database, group },
  });
  console.log(`created database ${database}`);
} else {
  console.log(`database ${database} already exists`);
}

const dbInfo = await turso(`/organizations/${org}/databases/${database}`);
const hostname = dbInfo?.database?.Hostname ?? dbInfo?.database?.hostname ?? dbInfo?.Hostname ?? dbInfo?.hostname;
if (!hostname) {
  console.error(dbInfo);
  throw new Error("Could not resolve database hostname");
}
const databaseUrl = `libsql://${hostname}`;

const tokenResponse = await turso(`/organizations/${org}/databases/${database}/auth/tokens?expiration=never&authorization=full-access`, {
  method: "POST",
});
const authToken = tokenResponse?.jwt ?? tokenResponse?.token;
if (!authToken) {
  console.error(tokenResponse);
  throw new Error("Could not mint database auth token");
}

vercelEnvSet("TURSO_DATABASE_URL", databaseUrl);
vercelEnvSet("TURSO_AUTH_TOKEN", authToken);
vercelEnvSet("WAZEN_ADMIN_EMAILS", adminEmail);
vercelEnvSet("WAZEN_APP_ORIGIN", origin);
vercelEnvSet("WAZEN_DEMO_MODE", "0");
vercelEnvSet("WAZEN_USE_NODE_SQLITE", "0");
vercelEnvSet("WAZEN_TRUST_OAI_HEADERS", "0");

console.log("Running migrations…");
run("npm", ["run", "db:migrate"], {
  TURSO_DATABASE_URL: databaseUrl,
  TURSO_AUTH_TOKEN: authToken,
});

console.log("Creating admin bootstrap token…");
const { createClient } = await import("@libsql/client");
const client = createClient({ url: databaseUrl, authToken });
await client.execute(`CREATE TABLE IF NOT EXISTS admin_bootstrap_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
)`);
const existingUser = await client.execute({
  sql: "SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
  args: [adminEmail],
});
let setupUrl = null;
if (existingUser.rows.length) {
  console.log(`User ${adminEmail} already exists — skipping bootstrap token`);
} else {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("base64");
  const now = new Date();
  await client.execute({
    sql: `INSERT INTO admin_bootstrap_tokens (id,email,display_name,token_hash,expires_at,used_at,created_by,created_at)
          VALUES (?,?,?,?,?,NULL,'provision',?)`,
    args: [randomUUID(), adminEmail, adminName, tokenHash, new Date(now.getTime() + 15 * 60_000).toISOString(), now.toISOString()],
  });
  setupUrl = `${origin}/admin/setup?token=${encodeURIComponent(rawToken)}`;
}
client.close();

console.log("Redeploying production…");
run("npx", ["vercel", "--prod", "--yes"]);

console.log(JSON.stringify({
  ok: true,
  databaseUrl,
  adminEmail,
  setupUrl,
  next: setupUrl
    ? "Open setupUrl within 15 minutes, set password (>=12 chars), then enable TOTP at /account/security"
    : "Admin user already exists — sign in and enable TOTP if needed",
}, null, 2));
