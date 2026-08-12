#!/usr/bin/env node
/**
 * Creates a one-time admin bootstrap token (hash stored; raw token printed once).
 * Usage:
 *   node scripts/bootstrap-admin.mjs --email owner@domain.com --name "Owner Name"
 * Optional:
 *   --ttl-minutes 15
 *   --origin https://your-app.vercel.app
 *
 * Does NOT set a password. Complete setup at /admin/setup?token=...
 */
import { createClient } from "@libsql/client";
import { createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const email = String(arg("--email")).trim().toLowerCase();
const displayName = String(arg("--name")).trim();
const ttlMinutes = Number(arg("--ttl-minutes", "15"));
const origin = String(arg("--origin", process.env.WAZEN_APP_ORIGIN || "http://localhost:3000")).replace(/\/$/, "");

if (!email || !email.includes("@") || displayName.length < 2) {
  console.error("Usage: npm run admin:bootstrap -- --email owner@domain.com --name \"Owner Name\"");
  process.exit(1);
}
if (!Number.isFinite(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 60) {
  console.error("--ttl-minutes must be between 5 and 60");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  process.exit(1);
}

const client = createClient({ url, authToken });
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

const existing = await client.execute({
  sql: "SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
  args: [email],
});
if (existing.rows.length) {
  console.error("A user with this email already exists. Refuse to bootstrap over it.");
  client.close();
  process.exit(3);
}

const rawToken = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("base64");
const now = new Date();
const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
const id = randomUUID();

await client.execute({
  sql: `INSERT INTO admin_bootstrap_tokens (id,email,display_name,token_hash,expires_at,used_at,created_by,created_at)
        VALUES (?,?,?,?,?,NULL,'cli',?)`,
  args: [id, email, displayName, tokenHash, expiresAt, now.toISOString()],
});
client.close();

const setupUrl = `${origin}/admin/setup?token=${encodeURIComponent(rawToken)}`;
console.log(JSON.stringify({
  ok: true,
  email,
  displayName,
  expiresAt,
  setupUrl,
  note: "Open setupUrl once, set password, then enable TOTP immediately. Raw token is not stored.",
}, null, 2));
