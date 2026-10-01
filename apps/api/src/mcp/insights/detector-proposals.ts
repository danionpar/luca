import type { LucaDb } from "../queries/db-types.js";
import type { CategorySeries, CategoryTrendResult } from "../queries/category-trend.js";
import type { Anomaly, DetectAnomaliesResult } from "../queries/detect-anomalies.js";
import type { RecurringCluster } from "../queries/detect-recurring.js";
import { formatClp, saveProposal, slugify } from "./proposals.js";
import type { SavedProposal } from "./proposals.js";

/** Stable key for a recurring cluster: merchant slug plus the band's lowest amount. */
export function recurringTopicKey(cluster: Pick<RecurringCluster, "merchant" | "anchorAmount">): string {
  return `recurring/${slugify(cluster.merchant)}/${cluster.anchorAmount}`;
}

/** Writes one proposal per recurring cluster through the insight store. */
export function proposeRecurring(db: LucaDb, clusters: RecurringCluster[]): SavedProposal[] {
  return clusters.map((c) => {
    const amountText = c.anchorAmount === c.maxAmount ? formatClp(c.anchorAmount) : `${formatClp(c.anchorAmount)} to ${formatClp(c.maxAmount)}`;
    const status =
      c.categorisation === "categorised"
        ? "All of its rows are already categorised."
        : `${c.uncategorisedRows} of its ${c.rowCount} rows are still uncategorised.`;
    return saveProposal(db, {
      type: "pattern",
      title: `Recurring charge: ${c.merchant} around ${formatClp(c.typicalAmount)}`,
      topicKey: recurringTopicKey(c),
      evidence:
        `Merchant "${c.merchant}" has a ${c.cadence} charge in the ${amountText} band: ${c.rowCount} rows across ${c.months} distinct billing months ` +
        `(${c.firstMonth} to ${c.lastMonth}), typical amount ${formatClp(c.typicalAmount)}, total ${formatClp(c.totalAmount)}. ` +
        `Instalment rows and card payments were excluded from this count. ${status}`,
    });
  });
}

/** Stable key for a category trend: one evolving observation per category, revised on every rerun. */
export function trendTopicKey(series: Pick<CategorySeries, "categoryId" | "categoryName">): string {
  return `trend/${slugify(series.categoryId ?? "uncategorised")}`;
}

/** Writes one proposal per rising or falling series; flat series are not worth the owner's attention. */
export function proposeTrends(db: LucaDb, result: CategoryTrendResult): SavedProposal[] {
  return result.series
    .filter((s) => s.direction !== "flat")
    .map((s) =>
      saveProposal(db, {
        type: "pattern",
        title: `Spending trend: ${s.categoryName} is ${s.direction}`,
        topicKey: trendTopicKey(s),
        evidence:
          `Category "${s.categoryName}" is ${s.direction} over ${result.fromMonth} to ${result.toMonth}: ` +
          `fitted slope ${formatClp(s.slopePerMonth)} per month on a mean of ${formatClp(s.meanMonthly)} per month, total ${formatClp(s.total)}. ` +
          `Monthly totals: ${s.months.map((m) => `${m.month} ${formatClp(m.total)}`).join(", ")}.`,
      }),
    );
}

/** Stable key for an anomaly: month plus category, so rerunning the same month upserts. */
export function anomalyTopicKey(billingMonth: string, anomaly: Pick<Anomaly, "categoryId">): string {
  return `anomaly/${billingMonth}/${slugify(anomaly.categoryId ?? "uncategorised")}`;
}

/** Writes one warning proposal per anomaly of the inspected month. */
export function proposeAnomalies(db: LucaDb, result: DetectAnomaliesResult): SavedProposal[] {
  const month = result.billingMonth;
  if (!month) return [];
  return result.anomalies.map((a) =>
    saveProposal(db, {
      type: "warning",
      title: `Unusual spending in ${month}: ${a.categoryName} is ${a.direction} its average`,
      topicKey: anomalyTopicKey(month, a),
      evidence:
        `Category "${a.categoryName}" totalled ${formatClp(a.value)} in ${month} against a trailing average of ${formatClp(a.trailingAverage)} ` +
        `(delta ${formatClp(a.delta)}, ratio ${a.ratio}, ${a.historyMonths} months of history in a ${result.trailingMonths}-month window).`,
    }),
  );
}
