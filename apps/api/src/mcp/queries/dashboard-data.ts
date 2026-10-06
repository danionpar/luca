import type { LucaDb } from "./db-types.js";
import { runQuery } from "./raw-sql.js";
import { SPENDING_ROW_FILTER } from "./spending-filter.js";

/** Bucket label for transactions with no category. Never dropped, never merged into another bucket. */
export const UNCATEGORIZED_LABEL = "Uncategorized";

export interface MonthTotal {
  /** Billing month, "YYYY-MM". */
  month: string;
  total: number;
  count: number;
  /** Transactions in the month that have a category. */
  categorizedCount: number;
}

export interface YearTotal {
  year: string;
  total: number;
  count: number;
  categorizedCount: number;
}

export interface CategoryBucket {
  /** Null for the uncategorized bucket. */
  categoryId: string | null;
  name: string;
  emoji: string;
  total: number;
  count: number;
}

export interface CategoryMonthCell {
  categoryId: string | null;
  month: string;
  total: number;
  count: number;
}

export interface CityBucket {
  /** Null for the "no city" bucket. */
  city: string | null;
  total: number;
  count: number;
}

export interface CityMonthCell {
  city: string | null;
  month: string;
  total: number;
  count: number;
}

export interface DashboardData {
  months: MonthTotal[];
  years: YearTotal[];
  categories: CategoryBucket[];
  categoryMonths: CategoryMonthCell[];
  cities: CityBucket[];
  cityMonths: CityMonthCell[];
}

/**
 * Every aggregate the local dashboard draws, computed by SQLite over the
 * same "spending" rows the insight detectors use (`SPENDING_ROW_FILTER`:
 * not projected, has a billing month, and not a `payment`/`pat` row, which
 * is money sent TO the card). A month's total here therefore equals
 * `monthly_summary`'s net spend minus its `payment` and `pat` sections.
 *
 * Uncategorized and city-less transactions each get their own explicit
 * bucket (`categoryId: null` / `city: null`) so no breakdown ever silently
 * under-represents the month. The month x category and month x city cells
 * are returned at that grain so the page can scope any period by adding up
 * whole cells; they are never re-derived from raw rows.
 */
export function dashboardData(db: LucaDb): DashboardData {
  const months = runQuery<MonthTotal>(
    db,
    `
    SELECT billing_month AS month, SUM(amount) AS total, COUNT(*) AS count,
           SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) AS categorizedCount
    FROM transactions
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY billing_month
    ORDER BY billing_month
    `,
  );

  const years = runQuery<YearTotal>(
    db,
    `
    SELECT substr(billing_month, 1, 4) AS year, SUM(amount) AS total, COUNT(*) AS count,
           SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) AS categorizedCount
    FROM transactions
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY year
    ORDER BY year
    `,
  );

  const categories = runQuery<CategoryBucket>(
    db,
    `
    SELECT t.category_id AS categoryId,
           COALESCE(c.name, '${UNCATEGORIZED_LABEL}') AS name,
           COALESCE(c.emoji, '') AS emoji,
           SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY t.category_id
    ORDER BY ABS(total) DESC
    `,
  );

  const categoryMonths = runQuery<CategoryMonthCell>(
    db,
    `
    SELECT category_id AS categoryId, billing_month AS month, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY category_id, billing_month
    ORDER BY billing_month, category_id
    `,
  );

  const cities = runQuery<CityBucket>(
    db,
    `
    SELECT city, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY city
    ORDER BY ABS(total) DESC
    `,
  );

  const cityMonths = runQuery<CityMonthCell>(
    db,
    `
    SELECT city, billing_month AS month, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions
    WHERE ${SPENDING_ROW_FILTER}
    GROUP BY city, billing_month
    ORDER BY billing_month, city
    `,
  );

  return { months, years, categories, categoryMonths, cities, cityMonths };
}
