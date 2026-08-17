import type { LucaDb } from "./db-types.js";
import { runQuery, runQueryOne } from "./raw-sql.js";

export const DEFAULT_UNCATEGORIZED_LIMIT = 50;
export const MAX_UNCATEGORIZED_LIMIT = 200;

export interface UncategorizedMerchantGroup {
  /** "(no merchant)" stands in for a NULL merchant so it still sorts and displays as a real group rather than vanishing. */
  merchant: string;
  count: number;
  total: number;
  firstDate: string;
  lastDate: string;
}

export interface ListUncategorizedResult {
  groups: UncategorizedMerchantGroup[];
  /** Across ALL uncategorized transactions, not just the page returned in `groups`. */
  totalMerchantGroups: number;
  totalTransactions: number;
  totalAmount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Groups every uncategorized transaction by merchant, biggest total first —
 * the shape that makes categorizing 1000+ rows actually tractable, since
 * one call to `bulk_categorize` or `create_rule` per merchant group clears
 * every row in it at once, instead of assigning a category one row at a
 * time. Prefer this over `list_transactions({ uncategorizedOnly: true })`
 * whenever the goal is to categorize rather than just inspect rows.
 */
export function listUncategorized(
  db: LucaDb,
  options: { limit?: number; offset?: number } = {},
): ListUncategorizedResult {
  const limit = clamp(Math.trunc(options.limit ?? DEFAULT_UNCATEGORIZED_LIMIT), 1, MAX_UNCATEGORIZED_LIMIT);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);

  const totals = runQueryOne<{ totalMerchantGroups: number; totalTransactions: number; totalAmount: number | null }>(
    db,
    `
    SELECT
      COUNT(DISTINCT COALESCE(merchant, '(no merchant)')) as totalMerchantGroups,
      COUNT(*) as totalTransactions,
      SUM(amount) as totalAmount
    FROM transactions
    WHERE category_id IS NULL
    `,
  );

  const groups = runQuery<UncategorizedMerchantGroup>(
    db,
    `
    SELECT
      COALESCE(merchant, '(no merchant)') as merchant,
      COUNT(*) as count,
      SUM(amount) as total,
      MIN(transaction_date) as firstDate,
      MAX(transaction_date) as lastDate
    FROM transactions
    WHERE category_id IS NULL
    GROUP BY COALESCE(merchant, '(no merchant)')
    ORDER BY ABS(total) DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset],
  );

  return {
    groups,
    totalMerchantGroups: totals?.totalMerchantGroups ?? 0,
    totalTransactions: totals?.totalTransactions ?? 0,
    totalAmount: totals?.totalAmount ?? 0,
    limit,
    offset,
    hasMore: offset + groups.length < (totals?.totalMerchantGroups ?? 0),
  };
}
