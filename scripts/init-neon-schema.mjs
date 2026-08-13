/**
 * Initializes Wazen schema on Neon (or whatever getRawDb resolves).
 * Usage: DATABASE_URL=... node --experimental-strip-types scripts/init-neon-schema.mjs
 */
import { ensureSchema, getRawDb } from "../db/runtime.ts";

const db = getRawDb();
await ensureSchema(db);
console.log(JSON.stringify({ ok: true, engine: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL ? "neon" : "other" }));
