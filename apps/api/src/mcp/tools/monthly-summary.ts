import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { DEFAULT_TRAILING_MONTHS, monthlySummary } from "../queries/monthly-summary.js";

const DESCRIPTION = `Summarizes one billing month: totals per statement section, overall net spend, and how it compares to the previous month and to a trailing average — every total computed by SQL, never estimated.

What it returns:
- sections: per-section totals and counts ("single", "installment", "charge", "payment", "pat", or "legacy_unclassified" for rows imported before section tracking existed), biggest absolute total first.
- netSpend: the sum of every transaction's signed amount for the month.
- previousMonth: the prior month's net spend plus the absolute and percent change from it. Null fields mean the prior month has no data at all (e.g. before the first imported statement).
- trailingAverage: the average net spend over the trailingMonths months before this one (default 3), counting only months that actually have data, plus the change from that average.

"Month" is the billing cycle (billing_month) — the statement that closed that month — not the date a purchase was originally made. Use list_transactions with dateFrom/dateTo instead when the original purchase date is what matters (e.g. an installment purchased in April can still be billed, and counted here, many months later).

Prefer this over summing list_transactions rows yourself: the sections, net spend, and comparisons here are all SQL aggregates, so they can't drift from a manual add-up.`;

const inputSchema = {
  month: z.string().regex(/^\d{4}-\d{2}$/).describe('Billing cycle to summarize, e.g. "2026-03".'),
  trailingMonths: z
    .number()
    .int()
    .positive()
    .max(24)
    .optional()
    .describe(`How many months before the given month to average over. Defaults to ${DEFAULT_TRAILING_MONTHS}.`),
};

export function registerMonthlySummaryTool(server: McpServer): void {
  server.registerTool(
    "monthly_summary",
    { title: "Monthly summary", description: DESCRIPTION, inputSchema },
    async ({ month, trailingMonths }) => {
      const result = monthlySummary(db, month, trailingMonths ?? DEFAULT_TRAILING_MONTHS);

      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
