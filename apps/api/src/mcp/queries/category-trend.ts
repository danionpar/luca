import type { LucaDb } from "./db-types.js";
import { runQuery, runQueryOne } from "./raw-sql.js";
import { LATEST_BILLING_MONTH_SQL, SPENDING_ROW_FILTER } from "./spending-filter.js";
import { shiftYearMonth } from "./year-month.js";

export const DEFAULT_TREND_MONTHS = 6;
export const DEFAULT_FLAT_THRESHOLD = 0.05;

export interface CategoryTrendOptions {
  /** Number of billing months in the window, ending at `toMonth`. Default 6, minimum 3. */
  months?: number;
  /** Last billing month of the window ("YYYY-MM"). Defaults to the latest month with data. */
  toMonth?: string;
  /**
   * A series is "flat" when its least-squares slope is within this fraction
   * of its mean monthly total (0.05 = the fitted line moves less than 5% of
   * the mean per month). Default 0.05.
   */
  flatThreshold?: number;
}

export type TrendDirection = "rising" | "falling" | "flat";

export interface MonthTotal {
  month: string;
  total: number;
}

export interface CategorySeries {
  /** Null for the uncategorised series. */
  categoryId: string | null;
  categoryName: string;
  direction: TrendDirection;
  /** Least-squares slope in CLP per month (rounded to an integer). */
  slopePerMonth: number;
  meanMonthly: number;
  total: number;
  /** One entry per month in the window, zero-filled. */
  months: MonthTotal[];
}

export interface CategoryTrendResult {
  fromMonth: string | null;
  toMonth: string | null;
  flatThreshold: number;
  series: CategorySeries[];
}

interface Row {
  categoryId: string | null;
  categoryName: string;
  month: string;
  total: number;
  slope: number;
  mean: number;
  seriesTotal: number;
  direction: TrendDirection;
}

/**
 * Per-category monthly totals over a window of billing months, each series
 * classified rising / falling / flat from the least-squares slope of its
 * monthly totals (x = month index, y = total) against a flat threshold.
 * Slope, mean and direction are computed by SQLite, not in TypeScript.
 *
 * Uncategorised spending is its own series (categoryId null), never hidden.
 * Months with no spend are zero-filled so a category that stopped (or
 * started) shows as falling (rising) instead of being averaged over fewer
 * points. Instalment rows count (they are real billed spending); projected
 * rows, card payments and PAT rows do not.
 */
export function categoryTrend(db: LucaDb, options: CategoryTrendOptions = {}): CategoryTrendResult {
  const months = options.months ?? DEFAULT_TREND_MONTHS;
  const flatThreshold = options.flatThreshold ?? DEFAULT_FLAT_THRESHOLD;
  if (!Number.isInteger(months) || months < 3) throw new Error("months must be an integer of at least 3: a trend needs three points.");

  const toMonth = options.toMonth ?? runQueryOne<{ month: string | null }>(db, LATEST_BILLING_MONTH_SQL)?.month ?? null;
  if (!toMonth) return { fromMonth: null, toMonth: null, flatThreshold, series: [] };
  const fromMonth = shiftYearMonth(toMonth, -(months - 1));

  const rows = runQuery<Row>(
    db,
    `
    WITH RECURSIVE
    span(lo, hi) AS (
      SELECT CAST(SUBSTR(?, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(?, 6, 2) AS INTEGER),
             CAST(SUBSTR(?, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(?, 6, 2) AS INTEGER)
    ),
    axis(ord) AS (
      SELECT lo FROM span
      UNION ALL
      SELECT ord + 1 FROM axis, span WHERE ord < hi
    ),
    spend AS (
      SELECT category_id AS cid,
             CAST(SUBSTR(billing_month, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(billing_month, 6, 2) AS INTEGER) AS ord,
             SUM(amount) AS amt
      FROM transactions
      WHERE ${SPENDING_ROW_FILTER}
      GROUP BY category_id, ord
    ),
    cats AS (
      SELECT DISTINCT cid FROM spend, span WHERE spend.ord BETWEEN span.lo AND span.hi
    ),
    grid AS (
      SELECT cats.cid AS cid, axis.ord AS ord, axis.ord - span.lo AS x,
             COALESCE((SELECT s.amt FROM spend s WHERE s.cid IS cats.cid AND s.ord = axis.ord), 0) AS y
      FROM cats CROSS JOIN axis CROSS JOIN span
    ),
    fit AS (
      SELECT cid,
             COUNT(*) AS n, SUM(x) AS sx, SUM(y) AS sy, SUM(x * y) AS sxy, SUM(x * x) AS sxx
      FROM grid GROUP BY cid
    ),
    stats AS (
      SELECT cid, sy AS seriesTotal, sy * 1.0 / n AS mean,
             (n * sxy - sx * sy) * 1.0 / (n * sxx - sx * sx) AS slope
      FROM fit
    )
    SELECT grid.cid AS categoryId,
           COALESCE(c.name, 'Uncategorized') AS categoryName,
           printf('%04d-%02d', (grid.ord - 1) / 12, (grid.ord - 1) % 12 + 1) AS month,
           grid.y AS total,
           CAST(ROUND(stats.slope) AS INTEGER) AS slope,
           CAST(ROUND(stats.mean) AS INTEGER) AS mean,
           stats.seriesTotal AS seriesTotal,
           CASE WHEN ABS(stats.slope) <= ? * ABS(stats.mean) THEN 'flat'
                WHEN stats.slope > 0 THEN 'rising' ELSE 'falling' END AS direction
    FROM grid
    JOIN stats ON stats.cid IS grid.cid
    LEFT JOIN categories c ON c.id = grid.cid
    ORDER BY ABS(stats.seriesTotal) DESC, categoryName, grid.ord
    `,
    [fromMonth, fromMonth, toMonth, toMonth, flatThreshold],
  );

  const byKey = new Map<string, CategorySeries>();
  for (const r of rows) {
    const key = r.categoryId ?? "\u0000uncategorised";
    let series = byKey.get(key);
    if (!series) {
      series = { categoryId: r.categoryId, categoryName: r.categoryName, direction: r.direction, slopePerMonth: r.slope, meanMonthly: r.mean, total: r.seriesTotal, months: [] };
      byKey.set(key, series);
    }
    series.months.push({ month: r.month, total: r.total });
  }

  return { fromMonth, toMonth, flatThreshold, series: [...byKey.values()] };
}
