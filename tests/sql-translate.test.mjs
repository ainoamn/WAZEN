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

test("translates PRAGMA table_info", () => {
  const sql = translateSqliteToPostgres("PRAGMA table_info(contribution_plans)");
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /contribution_plans/);
});
