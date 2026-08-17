import type { LucaDb } from "../queries/db-types.js";
import { containsPattern } from "../queries/like-pattern.js";
import { runMutation, runQueryOne } from "../queries/raw-sql.js";

export interface BulkCategorizeOptions {
  merchantPattern: string;
  categoryId: string;
  /** When true, evaluates the match and reports the count without writing anything. */
  dryRun?: boolean;
  /** When true, only touches rows that are currently uncategorized, leaving any existing category alone. */
  onlyUncategorized?: boolean;
}

export interface BulkCategorizeResult {
  merchantPattern: string;
  categoryId: string;
  dryRun: boolean;
  onlyUncategorized: boolean;
  /** How many rows match the pattern (and `onlyUncategorized`, if set) right now. */
  matched: number;
  /** How many rows were actually updated. Always 0 for a dry run. */
  updated: number;
}

/**
 * Assigns one category to every transaction whose merchant contains
 * `merchantPattern` (case-insensitive substring, same matching rule the
 * ingestion-time categorization rules use). This is the fast path for
 * clearing an entire merchant group surfaced by `list_uncategorized` in one
 * call instead of one `categorize` call per row.
 *
 * Always reports how many rows match before deciding anything else. Pass
 * `dryRun: true` to see that count without writing — recommended the first
 * time a new pattern is tried, since a pattern that is too broad (e.g. a
 * common word) can match more than intended.
 */
export function bulkCategorize(db: LucaDb, options: BulkCategorizeOptions): BulkCategorizeResult {
  const dryRun = options.dryRun ?? false;
  const onlyUncategorized = options.onlyUncategorized ?? false;

  const conditions = ["merchant LIKE ? ESCAPE '\\'"];
  const params: unknown[] = [containsPattern(options.merchantPattern)];
  if (onlyUncategorized) conditions.push("category_id IS NULL");
  const whereClause = conditions.join(" AND ");

  const matchedRow = runQueryOne<{ count: number }>(db, `SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`, params);
  const matched = matchedRow?.count ?? 0;

  const updated =
    !dryRun && matched > 0
      ? runMutation(db, `UPDATE transactions SET category_id = ?, updated_at = unixepoch() WHERE ${whereClause}`, [
          options.categoryId,
          ...params,
        ])
      : 0;

  return { merchantPattern: options.merchantPattern, categoryId: options.categoryId, dryRun, onlyUncategorized, matched, updated };
}
