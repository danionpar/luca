import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { proposeRecurring } from "../insights/detector-proposals.js";
import { DEFAULT_AMOUNT_TOLERANCE, DEFAULT_MAX_CLUSTERS, DEFAULT_MIN_MONTHS, detectRecurring } from "../queries/detect-recurring.js";

const DESCRIPTION = `Finds charges that repeat across billing months: subscriptions, memberships, standing purchases. Every figure is computed by SQL.

How it clusters: rows are grouped by merchant AND an amount band, because one merchant string can hide several unrelated recurring charges (an opaque payment gateway is the typical case). Within a merchant, amounts are sorted and a band starts at its lowest amount and takes everything up to that amount plus amountTolerance (default 3%; 0 = exact amounts only). A cluster is reported when it appears in at least minMonths distinct billing months (default 3). Each cluster reports cadence ("monthly" when present in at least 75% of the months between its first and last, else "irregular"), month count, first/last month, typical amount, total, and whether its rows are already categorised.

What it deliberately EXCLUDES, and why:
- Instalment rows (installment_total > 1): they repeat the same amount every month by construction, so including them would report every cuota as a "subscription" and drown the real signal. Use projected_commitments for instalments.
- Card payments (payment section): money paid to the card is never spending. Automatic bill payments (pat section: utilities and services charged to the card) are spending and ARE reported when they repeat.
- Projected (future) rows, refunds (non-positive amounts), and rows with no merchant.

Use it to discover what to categorise next, especially bare gateway merchants that no merchant-name rule can classify. Prefer list_uncategorized to triage by merchant name alone; prefer spending_by_category for plain totals.

Proposals: with saveAsInsights true, each returned cluster is written to the insight layer as a PROPOSAL awaiting the owner's confirmation, under a stable topic key (recurring/<merchant-slug>/<lowest-band-amount>), so re-running updates the same observation instead of duplicating it. It never creates rules and never categorises anything. Default false (read-only).`;

const inputSchema = {
  minMonths: z.number().int().min(2).max(60).default(DEFAULT_MIN_MONTHS).describe("Minimum distinct billing months for a cluster to count as recurring."),
  amountTolerance: z.number().min(0).max(0.5).default(DEFAULT_AMOUNT_TOLERANCE).describe("Amount band width as a fraction, e.g. 0.03 = 3%. 0 = exact amounts only."),
  onlyUncategorised: z.boolean().default(false).describe("Only return clusters that still have uncategorised rows."),
  limit: z.number().int().min(1).max(200).default(DEFAULT_MAX_CLUSTERS).describe("Maximum clusters returned, biggest total first."),
  saveAsInsights: z.boolean().default(false).describe("Write each returned cluster into the insight layer as a proposal. Default false."),
};

export function registerDetectRecurringTool(server: McpServer): void {
  server.registerTool("detect_recurring", { title: "Detect recurring charges", description: DESCRIPTION, inputSchema }, async ({ minMonths, amountTolerance, onlyUncategorised, limit, saveAsInsights }) => {
    const result = detectRecurring(db, { minMonths, amountTolerance, onlyUncategorised, limit });
    const output = { ...result, ...(saveAsInsights ? { insights: proposeRecurring(db, result.clusters) } : {}) };

    return {
      structuredContent: output as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    };
  });
}
