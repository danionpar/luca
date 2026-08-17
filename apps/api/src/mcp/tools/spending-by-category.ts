import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { spendingByCategory } from "../queries/spending-by-category.js";

const DESCRIPTION = `Totals and transaction counts per category, for a billing month, a purchase-date range, or (with no filters) all time. Biggest absolute total first, all computed by SQL.

Uncategorized transactions are never dropped — they get their own explicit row (categoryId: null, categoryName: "Uncategorized") so a breakdown never silently underrepresents how much spend is still unclassified.

When to prefer a different tool: to actually clear that uncategorized total, use list_uncategorized instead — it's grouped by merchant, which is what makes bulk_categorize and create_rule effective. This tool is for seeing the breakdown, not for fixing it.`;

const inputSchema = {
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Billing cycle filter, e.g. "2026-03".'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive lower bound on the purchase date (transaction_date), YYYY-MM-DD."),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive upper bound on the purchase date (transaction_date), YYYY-MM-DD."),
};

export function registerSpendingByCategoryTool(server: McpServer): void {
  server.registerTool(
    "spending_by_category",
    { title: "Spending by category", description: DESCRIPTION, inputSchema },
    async ({ month, dateFrom, dateTo }) => {
      const result = spendingByCategory(db, { billingMonth: month, dateFrom, dateTo });

      return {
        structuredContent: { categories: result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
