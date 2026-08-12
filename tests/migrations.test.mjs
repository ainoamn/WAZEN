import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { splitSqlStatements } from "../scripts/sql-statements.mjs";

test("migration parser keeps trigger bodies atomic", () => {
  const source = fs.readFileSync("drizzle/0003_enterprise_security.sql", "utf8");
  const statements = splitSqlStatements(source); const triggers = statements.filter((statement) => /^CREATE TRIGGER/i.test(statement));
  assert.equal(triggers.length, 3);
  assert.ok(triggers.every((statement) => /BEGIN[\s\S]+;\s*END;$/i.test(statement)));
});
