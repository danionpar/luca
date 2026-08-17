import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../db/schema.js";
import type { LucaDb } from "../db-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../../drizzle");

/**
 * A fresh, in-memory SQLite database with the real schema applied (by
 * replaying the committed drizzle migrations, oldest first), wrapped in the
 * same drizzle client shape production code uses. No fixture file or real
 * data ever touches this — every row a test seeds into it is synthetic.
 *
 * This is what "against a temporary scratch SQLite database seeded with
 * synthetic data" means for the query/categorization tests in this
 * repository: query logic runs against real SQL semantics (window
 * functions, CASE expressions, foreign keys) rather than a mocked driver.
 */
export function createTestDb(): LucaDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    sqlite.exec(sql);
  }

  return drizzle(sqlite, { schema }) as LucaDb;
}
