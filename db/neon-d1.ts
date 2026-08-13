import { Pool, type QueryResultRow } from "@neondatabase/serverless";
import { isSkippedSqliteTrigger, translateSqliteToPostgres } from "./sql-translate";

type D1Result<T> = {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
};

type SqlArg = string | number | bigint | boolean | null | Uint8Array;

function normalizeArgs(values: unknown[]): SqlArg[] {
  return values.map((value): SqlArg => {
    if (value === undefined) return null;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    return String(value);
  });
}

class NeonPreparedStatement {
  constructor(
    private readonly pool: Pool,
    readonly originalSql: string,
    readonly args: SqlArg[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new NeonPreparedStatement(this.pool, this.originalSql, normalizeArgs(values));
  }

  private translated() {
    return translateSqliteToPostgres(this.originalSql);
  }

  private async execute() {
    const sql = this.translated();
    if (isSkippedSqliteTrigger(sql)) {
      return { rows: [] as QueryResultRow[], rowCount: 0 };
    }
    return this.pool.query(sql, this.args);
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.execute();
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await this.execute();
    return {
      results: result.rows as unknown as T[],
      success: true,
      meta: { changes: result.rowCount ?? 0, last_row_id: 0, duration: 0 },
    };
  }

  async run(): Promise<D1Result<never>> {
    const result = await this.execute();
    return {
      results: [],
      success: true,
      meta: { changes: result.rowCount ?? 0, last_row_id: 0, duration: 0 },
    };
  }
}

class NeonD1Database {
  constructor(private readonly pool: Pool) {}

  prepare(sql: string) {
    return new NeonPreparedStatement(this.pool, sql);
  }

  async batch<T = unknown>(statements: NeonPreparedStatement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: D1Result<T>[] = [];
      for (const statement of statements) {
        const sql = translateSqliteToPostgres(statement.originalSql);
        if (isSkippedSqliteTrigger(sql)) {
          results.push({ results: [], success: true, meta: { changes: 0, last_row_id: 0, duration: 0 } });
          continue;
        }
        const result = await client.query(sql, statement.args);
        results.push({
          results: result.rows as unknown as T[],
          success: true,
          meta: { changes: result.rowCount ?? 0, last_row_id: 0, duration: 0 },
        });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async exec(sql: string) {
    const parts = sql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const translated = translateSqliteToPostgres(part);
      if (isSkippedSqliteTrigger(translated)) continue;
      await this.pool.query(translated);
    }
    return { count: parts.length, duration: 0 };
  }
}

type NeonGlobal = typeof globalThis & {
  __wazen_neon_pool__?: Pool;
  __wazen_neon_d1__?: D1Database;
};

export function getNeonD1(): D1Database {
  const global = globalThis as NeonGlobal;
  if (!global.__wazen_neon_d1__) {
    const url = process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
    global.__wazen_neon_pool__ = new Pool({ connectionString: url });
    global.__wazen_neon_d1__ = new NeonD1Database(global.__wazen_neon_pool__) as unknown as D1Database;
  }
  return global.__wazen_neon_d1__!;
}

export function hasNeonDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim());
}
