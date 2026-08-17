import type { LucaDb } from "./db-types.js";
import { runQuery, runQueryOne } from "./raw-sql.js";
import { EFFECTIVE_SECTION_SQL } from "./section.js";
import type { EffectiveSection } from "./section.js";
import { precedingYearMonths, shiftYearMonth } from "./year-month.js";

export const DEFAULT_TRAILING_MONTHS = 3;

export interface SectionTotal {
  section: EffectiveSection;
  total: number;
  count: number;
}

export interface MonthComparison {
  /** Null when there is no data at all for the comparison point (e.g. before the first imported statement). */
  netSpend: number | null;
  deltaAbsolute: number | null;
  /** Rounded to one decimal place. Null when there is nothing to divide by (no prior data, or prior net spend of 0). */
  deltaPercent: number | null;
}

export interface MonthlySummary {
  month: string;
  /** Per-section totals for this month, biggest absolute total first. */
  sections: SectionTotal[];
  netSpend: number;
  previousMonth: { month: string } & MonthComparison;
  trailingAverage: { monthsRequested: number; monthsWithData: number } & MonthComparison;
}

function netSpendFor(db: LucaDb, month: string): number {
  const row = runQueryOne<{ netSpend: number | null }>(
    db,
    "SELECT SUM(amount) as netSpend FROM transactions WHERE billing_month = ?",
    [month],
  );
  return row?.netSpend ?? 0;
}

function hasAnyDataFor(db: LucaDb, month: string): boolean {
  const row = runQueryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM transactions WHERE billing_month = ?", [month]);
  return (row?.count ?? 0) > 0;
}

function compare(current: number, against: number | null): MonthComparison {
  if (against === null) return { netSpend: null, deltaAbsolute: null, deltaPercent: null };
  const deltaAbsolute = current - against;
  const deltaPercent = against === 0 ? null : Math.round((deltaAbsolute / Math.abs(against)) * 1000) / 10;
  return { netSpend: against, deltaAbsolute, deltaPercent };
}

/**
 * Summarizes one billing month: totals per statement section, overall net
 * spend, and how that compares to the previous month and to the trailing
 * average of the `trailingMonths` months before it (default 3).
 *
 * "Month" here is the billing cycle (`billing_month`, e.g. the statement
 * that closed in March), not the date a purchase was originally made — an
 * installment purchased in April 2024 can still be billed, and counted, in
 * a much later month's summary. Use `list_transactions` with a
 * `dateFrom`/`dateTo` range instead when the original purchase date matters.
 *
 * Every SUM and AVG here is computed by SQLite; this function only
 * subtracts and divides two already-aggregated numbers to produce the
 * comparison deltas.
 */
export function monthlySummary(db: LucaDb, month: string, trailingMonths: number = DEFAULT_TRAILING_MONTHS): MonthlySummary {
  const sections = runQuery<SectionTotal>(
    db,
    `
    SELECT (${EFFECTIVE_SECTION_SQL}) as section, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE billing_month = ?
    GROUP BY section
    ORDER BY ABS(total) DESC
    `,
    [month],
  );

  const netSpend = netSpendFor(db, month);

  const previousMonthKey = shiftYearMonth(month, -1);
  const previousNetSpend = hasAnyDataFor(db, previousMonthKey) ? netSpendFor(db, previousMonthKey) : null;

  const priorMonths = precedingYearMonths(month, trailingMonths);
  const trailingRow =
    priorMonths.length > 0
      ? runQueryOne<{ avgTotal: number | null; monthsWithData: number }>(
          db,
          `
          SELECT AVG(total) as avgTotal, COUNT(*) as monthsWithData
          FROM (
            SELECT billing_month, SUM(amount) as total
            FROM transactions
            WHERE billing_month IN (${priorMonths.map(() => "?").join(",")})
            GROUP BY billing_month
          )
          `,
          priorMonths,
        )
      : undefined;
  const monthsWithData = trailingRow?.monthsWithData ?? 0;
  // AVG() always returns a float in SQLite even over integer inputs; this is
  // the one place a non-integer money value could leak, so it is rounded
  // back to a whole peso immediately, right where it comes out of SQL.
  const trailingAverageNetSpend =
    monthsWithData > 0 && trailingRow?.avgTotal != null ? Math.round(trailingRow.avgTotal) : null;

  return {
    month,
    sections,
    netSpend,
    previousMonth: { month: previousMonthKey, ...compare(netSpend, previousNetSpend) },
    trailingAverage: {
      monthsRequested: trailingMonths,
      monthsWithData,
      ...compare(netSpend, trailingAverageNetSpend),
    },
  };
}
