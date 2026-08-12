import { createClient, type Client, type InStatement } from "@libsql/client";

type D1Result<T> = {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
};

type SqlArg = string | number | bigint | boolean | null | Uint8Array;

class LibsqlPreparedStatement {
  constructor(
    private readonly client: Client,
    readonly sql: string,
    readonly args: SqlArg[] = [],
  ) {}

  bind(...values: unknown[]) {
    const args = values.map((value): SqlArg => {
      if (value === undefined) return null;
      if (
        value === null || typeof value === "string" || typeof value === "number" ||
        typeof value === "bigint" || typeof value === "boolean" || value instanceof Uint8Array
      ) return value;
      return String(value);
    });
    return new LibsqlPreparedStatement(this.client, this.sql, args);
  }

  private execute() {
    return this.client.execute({ sql: this.sql, args: this.args });
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.execute();
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await this.execute();
    return { results: result.rows as unknown as T[], success: true, meta: {
      changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0), duration: 0,
    } };
  }

  async run(): Promise<D1Result<never>> {
    const result = await this.execute();
    return { results: [], success: true, meta: {
      changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0), duration: 0,
    } };
  }

  toStatement(): InStatement { return { sql: this.sql, args: this.args }; }
}

class LibsqlD1Database {
  constructor(private readonly client: Client) {}
  prepare(sql: string) { return new LibsqlPreparedStatement(this.client, sql); }
  async batch<T = unknown>(statements: LibsqlPreparedStatement[]) {
    const results = await this.client.batch(statements.map((item) => item.toStatement()), "write");
    return results.map((result) => ({ results: result.rows as unknown as T[], success: true, meta: {
      changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0), duration: 0,
    } }));
  }
  async exec(sql: string) { await this.client.executeMultiple(sql); return { count: 0, duration: 0 }; }
}

const globalKey = "__wazen_libsql_d1__";

export function getLibsqlD1(): D1Database {
  const global = globalThis as typeof globalThis & { [globalKey]?: D1Database };
  if (!global[globalKey]) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error("DATABASE_NOT_CONFIGURED");
    global[globalKey] = new LibsqlD1Database(createClient({ url, authToken })) as unknown as D1Database;
  }
  return global[globalKey]!;
}
