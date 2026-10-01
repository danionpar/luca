import type { LucaDb } from "../queries/db-types.js";
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
