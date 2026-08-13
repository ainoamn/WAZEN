#!/usr/bin/env node
/**
 * Creates a one-time admin bootstrap token (hash stored; raw token printed once).
 * Supports Neon (DATABASE_URL) or Turso (TURSO_*).
 *
 * Usage:
 *   npm run admin:bootstrap -- --email owner@domain.com --name "Owner Name"
 * Optional:
 *   --ttl-minutes 15
 *   --origin https://your-app.vercel.app
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

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

const neonUrl = process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim();
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!neonUrl && !(tursoUrl && tursoToken)) {
  console.error("DATABASE_URL (Neon) or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are required");
  process.exit(1);
}

const rawToken = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("base64");
const now = new Date();
const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
const id = randomUUID();

async function withNeon() {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: neonUrl });
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_bootstrap_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
  )`);
  const existing = await pool.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1", [email]);
  if (existing.rows.length) {
    await pool.end();
    console.error("A user with this email already exists. Refuse to bootstrap over it.");
    process.exit(3);
  }
  await pool.query(
    `INSERT INTO admin_bootstrap_tokens (id,email,display_name,token_hash,expires_at,used_at,created_by,created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,'cli',$6)`,
    [id, email, displayName, tokenHash, expiresAt, now.toISOString()],
  );
  await pool.end();
}

async function withTurso() {
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: tursoUrl, authToken: tursoToken });
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
    client.close();
    console.error("A user with this email already exists. Refuse to bootstrap over it.");
    process.exit(3);
  }
  await client.execute({
    sql: `INSERT INTO admin_bootstrap_tokens (id,email,display_name,token_hash,expires_at,used_at,created_by,created_at)
          VALUES (?,?,?,?,?,NULL,'cli',?)`,
    args: [id, email, displayName, tokenHash, expiresAt, now.toISOString()],
  });
  client.close();
}

if (neonUrl) await withNeon();
else await withTurso();

const setupUrl = `${origin}/admin/setup?token=${encodeURIComponent(rawToken)}`;
console.log(JSON.stringify({
  ok: true,
  email,
  displayName,
  expiresAt,
  engine: neonUrl ? "neon" : "turso",
  setupUrl,
  note: "Open setupUrl once within the TTL. The raw token is not stored.",
}, null, 2));
