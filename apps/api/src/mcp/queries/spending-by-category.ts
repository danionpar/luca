import type { LucaDb } from "./db-types.js";
import { runQuery } from "./raw-sql.js";

export interface SpendingByCategoryFilters {
  /** The statement cycle (billing_month), e.g. "2026-03". */
  billingMonth?: string;
  /** Inclusive lower bound on the actual purchase date (transaction_date), YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive upper bound on the actual purchase date (transaction_date), YYYY-MM-DD. */
  dateTo?: string;
}

export interface CategoryTotal {
  /** Null for the uncategorized bucket — see `categoryName`. */
  categoryId: string | null;
  categoryName: string;
  categoryEmoji: string;
  total: number;
  count: number;
}

/**
 * Totals and counts per category, for a billing month, a purchase-date
 * range, or (with no filters) all time. Biggest absolute total first.
 *
 * Uncategorized transactions are never dropped from the result — they get
 * their own row (`categoryId: null`, `categoryName: "Uncategorized"`) so a
 * category breakdown never silently underrepresents how much of the month
 * is still unclassified. Prefer `list_uncategorized` when the goal is
 * actually triaging those rows by merchant rather than just seeing the
 * total.
 */
export function spendingByCategory(db: LucaDb, filters: SpendingByCategoryFilters = {}): CategoryTotal[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.billingMonth) {
    conditions.push("t.billing_month = ?");
    params.push(filters.billingMonth);
  }
  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?");
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return runQuery<CategoryTotal>(
    db,
    `
    SELECT
      t.category_id as categoryId,
      COALESCE(c.name, 'Uncategorized') as categoryName,
      COALESCE(c.emoji, '❓') as categoryEmoji,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ${whereClause}
    GROUP BY t.category_id
    ORDER BY ABS(total) DESC
    `,
    params,
  );
}
