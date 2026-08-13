/**
 * Translates WAZEN's SQLite/D1 SQL dialect into Postgres-compatible SQL for Neon.
 */
export function translateSqliteToPostgres(sql: string): string {
  let out = sql.trim();

  // Case-insensitive comparisons before placeholder renumbering
  out = out.replace(
    /((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*\?\s+COLLATE\s+NOCASE/gi,
    "LOWER($1)=LOWER(?)",
  );
  out = out.replace(/\s+COLLATE\s+NOCASE/gi, "");

  // INSERT OR IGNORE → ON CONFLICT DO NOTHING
  if (/^INSERT\s+OR\s+IGNORE\s+/i.test(out)) {
    out = out.replace(/^INSERT\s+OR\s+IGNORE\s+/i, "INSERT ");
    if (!/\bON\s+CONFLICT\b/i.test(out)) out = `${out} ON CONFLICT DO NOTHING`;
  }

  // Unique email index (expression)
  out = out.replace(
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_email_unique\s+ON\s+users\s*\(\s*email\s*\)/i,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email))",
  );

  // Parameter placeholders: ? → $1, $2, ...
  let index = 0;
  out = out.replace(/\?/g, () => `$${++index}`);

  // SQLite triggers are not portable — skip at execute time
  if (/^\s*(CREATE|DROP)\s+TRIGGER\b/i.test(out)) {
    return `-- SKIP_SQLITE_TRIGGER\n${out}`;
  }

  // PRAGMA table_info(name)
  const pragma = out.match(/^PRAGMA\s+table_info\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (pragma) {
    const table = pragma[1].toLowerCase();
    return `SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`;
  }

  return out;
}

export function isSkippedSqliteTrigger(sql: string) {
  return sql.includes("SKIP_SQLITE_TRIGGER");
}
