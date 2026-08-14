#!/usr/bin/env node
/**
 * Counts rows in known WAZEN tables. Read-only. Requires Turso credentials.
 */
import { createClient } from "@libsql/client";

const TABLES = [
  "financial_operation_claims", "webhook_events", "rate_limits", "email_outbox",
  "idempotency_keys", "api_keys", "totp_credentials", "auth_sessions",
  "email_verification_tokens", "password_reset_tokens", "admin_bootstrap_tokens",
  "data_requests", "audit_logs", "coupon_redemptions", "payments", "invoices",
  "subscriptions", "expense_splits", "trip_expenses", "settlements",
  "journal_lines", "journal_entries", "circle_turns", "circle_configs",
  "transactions", "contribution_plans", "member_installments", "documents", "document_sequences", "invites",
  "tenant_resources", "payment_provider_settings", "tenant_memberships",
  "members", "spaces", "customer_profiles", "platform_roles", "auth_credentials",
  "tenants", "users", "coupons", "plans", "_wazen_migrations",
];

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  process.exit(1);
}

const client = createClient({ url, authToken });
const rows = [];
for (const table of TABLES) {
  try {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM "${table}"`);
    rows.push({ table, count: Number(result.rows[0]?.count ?? 0), ok: true });
  } catch (error) {
    rows.push({ table, count: null, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
client.close();

const present = rows.filter((row) => row.ok);
const missing = rows.filter((row) => !row.ok);
const total = present.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), totalRows: total, tables: present, missing }, null, 2));
