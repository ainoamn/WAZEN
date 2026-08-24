import { neonConfig, Pool, type QueryResultRow } from "@neondatabase/serverless";
import ws from "ws";
import { isSkippedSqliteTrigger, translateSqliteToPostgres } from "./sql-translate";
import { getDbRequestUserId, isRlsEnforceEnabled } from "../lib/db-request-context";

// Vercel/Node serverless needs an explicit WebSocket constructor for Neon Pool.
neonConfig.webSocketConstructor = ws;

type D1Result<T> = {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
};

type SqlArg = string | number | bigint | boolean | null | Uint8Array;

type PoolClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[]; rowCount: number | null }>;
  release: () => void;
};

async function applyRequestRls(client: PoolClientLike) {
  if (!isRlsEnforceEnabled()) return;
  const userId = getDbRequestUserId();
  await client.query("SELECT set_config('app.bypass_rls', $1, true)", [userId ? "0" : "1"]);
  if (userId) {
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  }
}

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
    if (!isRlsEnforceEnabled() || !getDbRequestUserId()) {
      return this.pool.query(sql, this.args);
    }
    const client = await this.pool.connect() as unknown as PoolClientLike;
    try {
      await client.query("BEGIN");
      await applyRequestRls(client);
      const result = await client.query(sql, this.args);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect() as unknown as PoolClientLike;
    try {
      await client.query("BEGIN");
      await applyRequestRls(client);
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
    global.__wazen_neon_pool__ = new Pool({ connectionString: url, max: 8 });
    global.__wazen_neon_pool__.on("connect", (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => {
      // Soft RLS: policies allow when bypass != '0'. Enforce mode sets bypass=0 + app.user_id.
      const enforce = process.env.WAZEN_RLS_ENFORCE?.trim() === "1";
      void client.query("SELECT set_config('app.bypass_rls', $1, false)", [enforce ? "0" : "1"]).catch(() => {});
    });
    global.__wazen_neon_d1__ = new NeonD1Database(global.__wazen_neon_pool__) as unknown as D1Database;
    // Warm the pool so the first real query doesn't pay connection overhead.
    global.__wazen_neon_pool__.query("SELECT 1").catch(() => {});
  }
  return global.__wazen_neon_d1__!;
}

export function hasNeonDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim());
}
