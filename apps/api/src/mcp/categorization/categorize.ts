import type { LucaDb } from "../queries/db-types.js";
import { runMutation } from "../queries/raw-sql.js";

export interface CategorizeResult {
  requested: number;
  updated: number;
}

/**
 * Assigns one category to a specific, known set of transaction ids.
 * Overwrites any category already set on those rows — this is a deliberate
 * "the caller knows exactly which rows" tool; use `bulk_categorize` or a
 * `create_rule` instead when the selection is "every transaction from this
 * merchant".
 */
export function categorize(db: LucaDb, transactionIds: string[], categoryId: string): CategorizeResult {
  if (transactionIds.length === 0) return { requested: 0, updated: 0 };

  const placeholders = transactionIds.map(() => "?").join(",");
  const updated = runMutation(
    db,
    `UPDATE transactions SET category_id = ?, updated_at = unixepoch() WHERE id IN (${placeholders})`,
    [categoryId, ...transactionIds],
  );

  return { requested: transactionIds.length, updated };
}
