import type { LucaDb } from "./db-types.js";
import { runQuery, runQueryOne } from "./raw-sql.js";
import { LATEST_BILLING_MONTH_SQL, SPENDING_ROW_FILTER } from "./spending-filter.js";

export const DEFAULT_TRAILING_MONTHS = 6;
export const DEFAULT_MIN_HISTORY_MONTHS = 3;
export const DEFAULT_DEVIATION_THRESHOLD = 0.5;
export const DEFAULT_MIN_DELTA = 10000;

export interface DetectAnomaliesOptions {
  /** Billing month to inspect ("YYYY-MM"). Defaults to the latest month with data. */
  billingMonth?: string;
  /** How many months before `billingMonth` form the trailing window. Default 6. */
  trailingMonths?: number;
  /** A category needs spend in at least this many trailing months to be judged at all. Default 3. */
  minHistoryMonths?: number;
  /** Relative deviation from the trailing average that counts (0.5 = 50% above or below). Default 0.5. */
  threshold?: number;
  /** Ignore deviations smaller than this many CLP, so small categories are not flagged on noise. Default 10000. */
  minDelta?: number;
}

export interface Anomaly {
  /** Null for the uncategorised series. */
  categoryId: string | null;
  categoryName: string;
  value: number;
  trailingAverage: number;
  delta: number;
  /** value / trailingAverage, rounded to 2 decimals. */
  ratio: number;
  direction: "above" | "below";
  /** Trailing months in which the category had any spend. */
  historyMonths: number;
}

export interface DetectAnomaliesResult {
  billingMonth: string | null;
  trailingMonths: number;
  minHistoryMonths: number;
  threshold: number;
  minDelta: number;
  anomalies: Anomaly[];
}

/**
 * Finds categories whose total for a billing month deviates from their
 * trailing average by more than `threshold` (and by at least `minDelta`
 * CLP). The trailing average is the sum over the window divided by the
 * number of window months that exist in the data (months before the first
 * ever billing month are not counted as zeros); months inside that range
 * with no spend do count as zero.
 *
 * A category with spend in fewer than `minHistoryMonths` trailing months is
 * never flagged: a thin series says nothing about what is normal. A
 * category that was active but has no spend this month is reported as
 * "below" (value 0). Uncategorised is its own series. Everything, including
 * the ratio, is computed by SQLite.
 */
export function detectAnomalies(db: LucaDb, options: DetectAnomaliesOptions = {}): DetectAnomaliesResult {
  const trailingMonths = options.trailingMonths ?? DEFAULT_TRAILING_MONTHS;
  const minHistoryMonths = options.minHistoryMonths ?? DEFAULT_MIN_HISTORY_MONTHS;
  const threshold = options.threshold ?? DEFAULT_DEVIATION_THRESHOLD;
  const minDelta = options.minDelta ?? DEFAULT_MIN_DELTA;
  const base = { trailingMonths, minHistoryMonths, threshold, minDelta };

  const billingMonth = options.billingMonth ?? runQueryOne<{ month: string | null }>(db, LATEST_BILLING_MONTH_SQL)?.month ?? null;
  if (!billingMonth) return { billingMonth: null, ...base, anomalies: [] };

  const anomalies = runQuery<Anomaly>(
    db,
    `
    WITH
    spend AS (
      SELECT category_id AS cid,
             CAST(SUBSTR(billing_month, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(billing_month, 6, 2) AS INTEGER) AS ord,
             SUM(amount) AS amt
      FROM transactions
      WHERE ${SPENDING_ROW_FILTER}
      GROUP BY category_id, ord
    ),
    win(cur, lo) AS (
      SELECT CAST(SUBSTR(?, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(?, 6, 2) AS INTEGER),
             CAST(SUBSTR(?, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(?, 6, 2) AS INTEGER) - ?
    ),
    avail(n) AS (
      SELECT win.cur - MAX(win.lo, (SELECT MIN(ord) FROM spend)) FROM win
    ),
    per_cat AS (
      SELECT spend.cid AS cid,
             SUM(CASE WHEN spend.ord = win.cur THEN spend.amt ELSE 0 END) AS value,
             SUM(CASE WHEN spend.ord >= win.lo AND spend.ord < win.cur THEN spend.amt ELSE 0 END) AS trailingSum,
             COUNT(CASE WHEN spend.ord >= win.lo AND spend.ord < win.cur AND spend.amt <> 0 THEN 1 END) AS historyMonths
      FROM spend, win
      GROUP BY spend.cid
    ),
    scored AS (
      SELECT cid, value, historyMonths,
             trailingSum * 1.0 / avail.n AS avgExact
      FROM per_cat, avail
      WHERE avail.n > 0 AND historyMonths >= ?
    )
    SELECT scored.cid AS categoryId,
           COALESCE(c.name, 'Uncategorized') AS categoryName,
           scored.value AS value,
           CAST(ROUND(scored.avgExact) AS INTEGER) AS trailingAverage,
           CAST(ROUND(scored.value - scored.avgExact) AS INTEGER) AS delta,
           ROUND(scored.value / scored.avgExact, 2) AS ratio,
           CASE WHEN scored.value > scored.avgExact THEN 'above' ELSE 'below' END AS direction,
           scored.historyMonths AS historyMonths
    FROM scored
    LEFT JOIN categories c ON c.id = scored.cid
    WHERE scored.avgExact > 0
      AND ABS(scored.value - scored.avgExact) >= ?
      AND ABS(scored.value - scored.avgExact) > ? * scored.avgExact
    ORDER BY ABS(scored.value - scored.avgExact) DESC, categoryName
    `,
    [billingMonth, billingMonth, billingMonth, billingMonth, trailingMonths, minHistoryMonths, minDelta, threshold],
  );

  return { billingMonth, ...base, anomalies };
}
