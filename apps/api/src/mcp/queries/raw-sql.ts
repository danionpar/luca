import type { LucaDb } from "./db-types.js";

/**
 * Runs a raw parameterized SQL query against the same underlying
 * better-sqlite3 connection drizzle wraps (exposed as `$client`), and
 * returns the rows typed as `T[]`.
 *
 * The aggregation queries in this folder (section totals, trailing
 * averages, category rollups) are easier to read and audit as plain SQL
 * than as a query-builder chain, and going through `$client` still shares
 * drizzle's single connection rather than opening a second one. This is the
 * "golden rule" boundary in code: every number returned here is computed by
 * SQLite itself, never summed or averaged in TypeScript.
 */
export function runQuery<T = Record<string, unknown>>(db: LucaDb, sql: string, params: unknown[] = []): T[] {
  return db.$client.prepare(sql).all(...params) as T[];
}

/** Same as `runQuery`, but for a statement expected to return at most one row. */
export function runQueryOne<T = Record<string, unknown>>(db: LucaDb, sql: string, params: unknown[] = []): T | undefined {
  return db.$client.prepare(sql).get(...params) as T | undefined;
}

/** Runs a mutating statement (INSERT/UPDATE/DELETE) and returns the affected row count. */
export function runMutation(db: LucaDb, sql: string, params: unknown[] = []): number {
  return db.$client.prepare(sql).run(...params).changes;
}
