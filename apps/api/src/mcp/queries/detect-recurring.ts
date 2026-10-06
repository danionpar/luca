import type { LucaDb } from "./db-types.js";
import { runQuery } from "./raw-sql.js";
import { NOT_INSTALMENT_FILTER, SPENDING_ROW_FILTER } from "./spending-filter.js";

export const DEFAULT_MIN_MONTHS = 3;
export const DEFAULT_AMOUNT_TOLERANCE = 0.03;
export const DEFAULT_MAX_CLUSTERS = 50;

export interface DetectRecurringOptions {
  /** A cluster must appear in at least this many distinct billing months. Default 3. */
  minMonths?: number;
  /**
   * Amount band width as a fraction (0.03 = 3%). Rows of one merchant whose
   * amounts fall within [anchor, anchor * (1 + tolerance)] form one cluster;
   * 0 means exact amounts only. Default 0.03.
   */
  amountTolerance?: number;
  /** Only clusters with at least one uncategorised row. */
  onlyUncategorised?: boolean;
  /** Cap on clusters returned, biggest total first. Default 50. */
  limit?: number;
}

export type ClusterCategorisation = "categorised" | "partial" | "uncategorised";

export interface RecurringCluster {
  /** Raw merchant string as printed on the statement (first alphabetically among the cluster's variants). */
  merchant: string;
  /** Lowest amount in the band; it anchors the band and the proposal's topic key. */
  anchorAmount: number;
  maxAmount: number;
  typicalAmount: number;
  rowCount: number;
  months: number;
  firstMonth: string;
  lastMonth: string;
  spanMonths: number;
  /** "monthly" when the cluster appears in at least 75% of the months between first and last, otherwise "irregular". */
  cadence: "monthly" | "irregular";
  totalAmount: number;
  categorisation: ClusterCategorisation;
  uncategorisedRows: number;
}

export interface DetectRecurringResult {
  minMonths: number;
  amountTolerance: number;
  /** Clusters that met the threshold, before `limit` was applied. */
  totalClusters: number;
  clusters: RecurringCluster[];
}

interface RawCluster {
  merchant: string;
  anchorAmount: number;
  maxAmount: number;
  typicalAmount: number;
  rowCount: number;
  months: number;
  firstMonth: string;
  lastMonth: string;
  spanMonths: number;
  totalAmount: number;
  categorisedRows: number;
  totalClusters: number;
  cadence: "monthly" | "irregular";
}

/**
 * Finds charges that repeat across billing months.
 *
 * Clustering (all in SQL): rows are grouped by case-insensitive trimmed
 * merchant, then, within a merchant, sorted by amount and split into bands.
 * A band starts at its lowest amount (the anchor) and takes every following
 * amount up to anchor * (1 + tolerance); the next amount above starts a new
 * band. This is what separates several different subscriptions hiding under
 * one merchant string, and it is deterministic (no drift: every member is
 * compared to the anchor, not to its neighbour).
 *
 * Excluded before clustering: instalment rows (`installment_total > 1` or
 * section `installment`; they repeat by construction), `payment`
 * rows, projected rows, refunds (non-positive amounts), and rows without a
 * merchant or billing month.
 */
export function detectRecurring(db: LucaDb, options: DetectRecurringOptions = {}): DetectRecurringResult {
  const minMonths = options.minMonths ?? DEFAULT_MIN_MONTHS;
  const amountTolerance = options.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE;
  const limit = options.limit ?? DEFAULT_MAX_CLUSTERS;

  const rows = runQuery<RawCluster>(
    db,
    `
    WITH RECURSIVE
    base AS (
      SELECT id,
             LOWER(TRIM(merchant)) AS mkey,
             merchant,
             amount,
             billing_month AS bm,
             category_id
      FROM transactions
      WHERE ${SPENDING_ROW_FILTER}
        AND ${NOT_INSTALMENT_FILTER}
        AND amount > 0
        AND merchant IS NOT NULL AND TRIM(merchant) <> ''
    ),
    ranked AS (
      SELECT id, mkey, amount, ROW_NUMBER() OVER (PARTITION BY mkey ORDER BY amount, id) AS rn FROM base
    ),
    walk(id, mkey, rn, anchor) AS (
      SELECT id, mkey, rn, amount FROM ranked WHERE rn = 1
      UNION ALL
      SELECT r.id, r.mkey, r.rn, CASE WHEN r.amount > w.anchor * (1 + ?) THEN r.amount ELSE w.anchor END
      FROM walk w JOIN ranked r ON r.mkey = w.mkey AND r.rn = w.rn + 1
    ),
    clusters AS (
      SELECT MIN(b.merchant) AS merchant,
             w.anchor AS anchorAmount,
             MAX(b.amount) AS maxAmount,
             CAST(ROUND(AVG(b.amount)) AS INTEGER) AS typicalAmount,
             COUNT(*) AS rowCount,
             COUNT(DISTINCT b.bm) AS months,
             MIN(b.bm) AS firstMonth,
             MAX(b.bm) AS lastMonth,
             SUM(b.amount) AS totalAmount,
             SUM(CASE WHEN b.category_id IS NOT NULL THEN 1 ELSE 0 END) AS categorisedRows
      FROM walk w JOIN base b ON b.id = w.id
      GROUP BY w.mkey, w.anchor
    )
    SELECT merchant, anchorAmount, maxAmount, typicalAmount, rowCount, months, firstMonth, lastMonth, spanMonths, totalAmount, categorisedRows,
           CASE WHEN months * 4 >= spanMonths * 3 THEN 'monthly' ELSE 'irregular' END AS cadence,
           COUNT(*) OVER () AS totalClusters
    FROM (
      SELECT clusters.*,
             (CAST(SUBSTR(lastMonth, 1, 4) AS INTEGER) - CAST(SUBSTR(firstMonth, 1, 4) AS INTEGER)) * 12
               + CAST(SUBSTR(lastMonth, 6, 2) AS INTEGER) - CAST(SUBSTR(firstMonth, 6, 2) AS INTEGER) + 1 AS spanMonths
      FROM clusters
    )
    WHERE months >= ?
      ${options.onlyUncategorised ? "AND categorisedRows < rowCount" : ""}
    ORDER BY totalAmount DESC, merchant, anchorAmount
    LIMIT ?
    `,
    [amountTolerance, minMonths, limit],
  );

  return {
    minMonths,
    amountTolerance,
    totalClusters: rows[0]?.totalClusters ?? 0,
    clusters: rows.map(({ categorisedRows, totalClusters: _total, ...rest }) => ({
      ...rest,
      categorisation: categorisedRows === 0 ? "uncategorised" : categorisedRows === rest.rowCount ? "categorised" : "partial",
      uncategorisedRows: rest.rowCount - categorisedRows,
    })),
  };
}
