import type { LucaDb } from "./db-types.js";
import { runQuery } from "./raw-sql.js";

export interface CategoryRow {
  id: string;
  name: string;
  emoji: string;
  type: "income" | "expense" | "saving";
  parentId: string | null;
  isActive: boolean;
}

/**
 * The category catalogue, so a model can pick a valid `categoryId` before
 * calling `categorize`, `bulk_categorize` or `create_rule` rather than
 * guessing a name or id that doesn't exist. Inactive categories are
 * excluded by default — pass `includeInactive: true` to see the full
 * catalogue including retired categories.
 */
export function listCategories(db: LucaDb, includeInactive: boolean = false): CategoryRow[] {
  const whereClause = includeInactive ? "" : "WHERE is_active = 1";
  const rows = runQuery<Omit<CategoryRow, "isActive"> & { isActive: number }>(
    db,
    `
    SELECT id, name, emoji, type, parent_id as parentId, is_active as isActive
    FROM categories
    ${whereClause}
    ORDER BY type, sort_order
    `,
  );
  // better-sqlite3 returns SQLite's raw 0/1 for the boolean column when
  // queried through $client directly (drizzle's boolean mode only applies
  // to its own query builder), so it is coerced here explicitly.
  return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
}
