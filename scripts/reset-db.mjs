#!/usr/bin/env node
/**
 * Safe database reset for Turso.
 * Default mode is --dry-run (inventory only). Destructive mode requires:
 *   WAZEN_RESET_CONFIRM="RESET <env-name> <YYYY-MM-DD>"
 *   --execute
 *   --keep-plans (optional, default true)
 *
 * Never deletes _wazen_migrations.
 * Prefer creating a NEW production database instead of resetting the live one.
 */
import { createClient } from "@libsql/client";
import { spawnSync } from "node:child_process";

const dryRun = !process.argv.includes("--execute");
const keepPlans = !process.argv.includes("--drop-plans");
const envName = process.env.WAZEN_ENV_NAME ?? "unspecified";
const today = new Date().toISOString().slice(0, 10);
const expected = `RESET ${envName} ${today}`;
const confirm = process.env.WAZEN_RESET_CONFIRM ?? "";

const DELETE_ORDER = [
  "financial_operation_claims", "webhook_events", "rate_limits", "email_outbox",
  "idempotency_keys", "api_keys", "totp_credentials", "auth_sessions",
  "email_verification_tokens", "password_reset_tokens", "admin_bootstrap_tokens",
  "data_requests", "audit_logs", "coupon_redemptions", "payments", "invoices",
  "subscriptions", "expense_splits", "trip_expenses", "settlements",
  "journal_lines", "journal_entries", "circle_turns", "circle_configs",
  "transactions", "contribution_plans", "member_installments", "documents", "document_sequences", "invites",
  "tenant_resources", "payment_provider_settings", "tenant_memberships",
  "members", "spaces", "customer_profiles", "platform_roles", "auth_credentials",
  "tenants", "users", "coupons",
];

console.log(`reset-db mode=${dryRun ? "dry-run" : "EXECUTE"} env=${envName} keepPlans=${keepPlans}`);

const inventory = spawnSync(process.execPath, ["scripts/db-inventory.mjs"], {
  env: process.env,
  encoding: "utf8",
  cwd: process.cwd(),
});
if (inventory.status !== 0) {
  console.error(inventory.stderr || inventory.stdout);
  process.exit(inventory.status ?? 1);
}
console.log(inventory.stdout);

if (dryRun) {
  console.log("Dry-run only. To execute, set WAZEN_RESET_CONFIRM and pass --execute.");
  console.log(`Expected confirm phrase: ${expected}`);
  process.exit(0);
}

if (confirm !== expected) {
  console.error(`Refusing destructive reset. WAZEN_RESET_CONFIRM must equal exactly:\n${expected}`);
  process.exit(2);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  process.exit(1);
}

const client = createClient({ url, authToken });
const statements = DELETE_ORDER.map((table) => ({ sql: `DELETE FROM "${table}"` }));
if (!keepPlans) statements.push({ sql: `DELETE FROM plans` });

await client.batch(statements, "write");
client.close();
console.log(JSON.stringify({
  ok: true,
  mode: "execute",
  envName,
  keepPlans,
  deletedTables: DELETE_ORDER.concat(keepPlans ? [] : ["plans"]),
  completedAt: new Date().toISOString(),
}, null, 2));
console.log("Next: npm run db:migrate && npm run admin:bootstrap -- --email you@domain --name \"Owner\"");
