/**
 * D1-compatible wrapper around Node's built-in SQLite (node:sqlite).
 * Used on Vercel / local Next so /api routes run without Cloudflare D1.
 */
import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

type StatementResult<T> = {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
};

type SqlValue = null | number | bigint | string | Uint8Array | Buffer;

class NodeD1PreparedStatement {
  #db: DatabaseSync;
  #sql: string;
  #params: SqlValue[] = [];

  constructor(db: DatabaseSync, sql: string) {
    this.#db = db;
    this.#sql = sql;
  }

  bind(...params: unknown[]) {
    this.#params = params.map((value) => {
      if (value === undefined) return null;
      if (
        value === null ||
        typeof value === "number" ||
        typeof value === "bigint" ||
        typeof value === "string" ||
        value instanceof Uint8Array ||
        Buffer.isBuffer(value)
      ) {
        return value as SqlValue;
      }
      return String(value);
    });
    return this;
  }

  async first<T = Record<string, unknown>>(
    colName?: string,
  ): Promise<T | null> {
    const row = this.#db.prepare(this.#sql).get(...this.#params) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<StatementResult<T>> {
    const rows = this.#db.prepare(this.#sql).all(...this.#params) as T[];
    return {
      results: rows,
      success: true,
      meta: { changes: 0, last_row_id: 0, duration: 0 },
    };
  }

  async run(): Promise<StatementResult<never>> {
    const info = this.#db.prepare(this.#sql).run(...this.#params);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
        duration: 0,
      },
    };
  }
}

class NodeD1Database {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  prepare(sql: string) {
    return new NodeD1PreparedStatement(this.#db, sql);
  }

  async batch<T = unknown>(
    statements: NodeD1PreparedStatement[],
  ): Promise<StatementResult<T>[]> {
    const out: StatementResult<T>[] = [];
    this.#db.exec("BEGIN");
    try {
      for (const statement of statements) {
        // Prefer run; SELECT statements use all/first which callers do outside batch.
        // Our ensureSchema/seeds use .bind().run paths via batch of PreparedStatements.
        const result = await statement.run();
        out.push(result as StatementResult<T>);
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return out;
  }

  async exec(sql: string) {
    this.#db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

const globalKey = "__wazen_node_d1__";

function resolveDbPath() {
  if (process.env.WAZEN_SQLITE_PATH) {
    const configured = process.env.WAZEN_SQLITE_PATH;
    if (configured !== ":memory:") fs.mkdirSync(path.dirname(configured), { recursive: true });
    return configured;
  }
  if (process.env.VERCEL) throw new Error("DATABASE_NOT_CONFIGURED");
  const local = path.join(process.cwd(), ".data");
  fs.mkdirSync(local, { recursive: true });
  return path.join(local, "wazen.sqlite");
}

export function getNodeSqliteD1(): D1Database {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: D1Database;
  };
  if (!g[globalKey]) {
    const file = resolveDbPath();
    const db = new DatabaseSync(file);
    // Match common SQLite pragmas used by web apps.
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    g[globalKey] = new NodeD1Database(db) as unknown as D1Database;
  }
  return g[globalKey]!;
}
