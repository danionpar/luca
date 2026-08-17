import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, listTransactions } from "../queries/list-transactions.js";

const DESCRIPTION = `Lists individual transactions with filters, paginated.

What it returns: a compact row per transaction (date, merchant, description, amount, categoryId, section, installment position if any, billing month), plus totalCount and hasMore for pagination. Rows are newest purchase-date first.

Filters (all optional, AND-combined):
- month: the statement/billing cycle (e.g. "2026-03"), NOT the original purchase date. An installment purchased in April 2024 can still show up in the "2026-03" billing month if it's still being paid off — use dateFrom/dateTo instead when the original purchase date is what matters.
- dateFrom / dateTo: an inclusive range on the actual purchase date (YYYY-MM-DD).
- categoryId, merchantContains (case-insensitive substring), section ("single" | "installment" | "charge" | "payment" | "pat" | "legacy_unclassified" — see list_categories/spending_by_category for what these mean), type ("income" | "expense" | "saving").
- uncategorizedOnly: true to see only rows with no category assigned.

When to prefer a different tool: for "how much did I spend on X" totals, use monthly_summary or spending_by_category instead — they compute the sums in SQL rather than making the caller add up rows. For categorizing many rows from the same merchant at once, use list_uncategorized instead, which is already grouped by merchant.`;

const inputSchema = {
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Billing cycle filter, e.g. "2026-03". This is the statement month, not the purchase date.'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive lower bound on the purchase date (transaction_date), YYYY-MM-DD."),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive upper bound on the purchase date (transaction_date), YYYY-MM-DD."),
  categoryId: z.string().optional().describe("Restrict to one category id. Get valid ids from list_categories."),
  merchantContains: z.string().optional().describe("Case-insensitive substring match against the merchant name."),
  section: z
    .enum(["single", "installment", "charge", "payment", "pat", "legacy_unclassified"])
    .optional()
    .describe("Statement section. 'legacy_unclassified' covers non-installment rows imported before section tracking existed."),
  type: z.enum(["income", "expense", "saving"]).optional(),
  uncategorizedOnly: z.boolean().optional().describe("When true, only rows with no category assigned."),
  limit: z.number().int().positive().max(MAX_LIST_LIMIT).optional().describe(`Max rows to return. Defaults to ${DEFAULT_LIST_LIMIT}, capped at ${MAX_LIST_LIMIT}.`),
  offset: z.number().int().nonnegative().optional().describe("Rows to skip, for pagination. Defaults to 0."),
};

export function registerListTransactionsTool(server: McpServer): void {
  server.registerTool(
    "list_transactions",
    { title: "List transactions", description: DESCRIPTION, inputSchema },
    async (args) => {
      const result = listTransactions(db, {
        billingMonth: args.month,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        categoryId: args.categoryId,
        merchantContains: args.merchantContains,
        section: args.section,
        type: args.type,
        uncategorizedOnly: args.uncategorizedOnly,
        limit: args.limit,
        offset: args.offset,
      });

      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
