import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { splitSqlStatements } from "./sql-statements.mjs";

const url = process.env.TURSO_DATABASE_URL; const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
const client = createClient({ url, authToken });
await client.execute(`CREATE TABLE IF NOT EXISTS _wazen_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`);
const directory = path.join(process.cwd(), "drizzle");
const files = fs.readdirSync(directory).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
for (const name of files) {
  const sql = fs.readFileSync(path.join(directory, name), "utf8"); const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await client.execute({ sql: "SELECT checksum FROM _wazen_migrations WHERE name=?", args: [name] });
  if (existing.rows.length) {
    if (existing.rows[0].checksum !== checksum) throw new Error(`Previously applied migration changed: ${name}`);
    console.log(`skip ${name}`); continue;
  }
  const statements = [];
  for (const statement of splitSqlStatements(sql)) {
    const alter = statement.match(/^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
    if (alter) {
      const columns = await client.execute(`PRAGMA table_info("${alter[1]}")`);
      if (columns.rows.some((row) => String(row.name).toLowerCase() === alter[2].toLowerCase())) continue;
    }
    statements.push(statement);
  }
  await client.batch([...statements, { sql: "INSERT INTO _wazen_migrations (name,checksum,applied_at) VALUES (?,?,?)", args: [name, checksum, new Date().toISOString()] }], "write");
  console.log(`applied ${name}`);
}
client.close();
