import assert from "node:assert/strict";
import test from "node:test";
import { translateSqliteToPostgres } from "../db/sql-translate.ts";

test("translates placeholders and INSERT OR IGNORE", () => {
  const sql = translateSqliteToPostgres("INSERT OR IGNORE INTO users (id,email) VALUES (?,?)");
  assert.equal(sql, "INSERT INTO users (id,email) VALUES ($1,$2) ON CONFLICT DO NOTHING");
});

test("translates COLLATE NOCASE comparisons", () => {
  const sql = translateSqliteToPostgres("SELECT id FROM users WHERE email=? COLLATE NOCASE LIMIT 1");
  assert.equal(sql, "SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1");
});

test("translates aliased COLLATE NOCASE comparisons", () => {
  const sql = translateSqliteToPostgres("SELECT u.id FROM users u WHERE u.email=? COLLATE NOCASE LIMIT 1");
  assert.equal(sql, "SELECT u.id FROM users u WHERE LOWER(u.email)=LOWER($1) LIMIT 1");
});

test("translates PRAGMA table_info", () => {
  const sql = translateSqliteToPostgres("PRAGMA table_info(contribution_plans)");
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /contribution_plans/);
});

test("keeps native Postgres payment triggers", () => {
  const sql = translateSqliteToPostgres(`CREATE TRIGGER trg_payment_status_transition_pg
    BEFORE UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION wazen_payment_status_guard()`);
  assert.equal(sql.includes("SKIP_SQLITE_TRIGGER"), false);
  assert.match(sql, /EXECUTE FUNCTION wazen_payment_status_guard/);
});

test("skips SQLite RAISE ABORT triggers", () => {
  const sql = translateSqliteToPostgres(`CREATE TRIGGER trg_payment_status_transition BEFORE UPDATE OF status ON payments
      WHEN NOT ((OLD.status='pending' AND NEW.status IN ('succeeded','failed')))
      BEGIN SELECT RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION'); END`);
  assert.match(sql, /SKIP_SQLITE_TRIGGER/);
});
