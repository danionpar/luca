import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { DEFAULT_UNCATEGORIZED_LIMIT, MAX_UNCATEGORIZED_LIMIT, listUncategorized } from "../queries/list-uncategorized.js";

const DESCRIPTION = `Groups every uncategorized transaction by merchant, biggest total first — the entry point for clearing a large uncategorized backlog, since categorizing by merchant with bulk_categorize or create_rule clears an entire group in one call instead of one row at a time.

Returns merchant groups (merchant, count, total, first/last date) for the requested page, plus totals across ALL uncategorized transactions (not just this page): totalMerchantGroups, totalTransactions, totalAmount.

A null merchant is grouped under the literal string "(no merchant)" rather than disappearing from the results.

When to prefer a different tool: once a merchant group here looks right, call bulk_categorize (one-off) or create_rule with applyToExisting (so future imports from this merchant arrive already categorized) — never categorize row by row when a merchant group is available here.`;

const inputSchema = {
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_UNCATEGORIZED_LIMIT)
    .optional()
    .describe(`Max merchant groups to return. Defaults to ${DEFAULT_UNCATEGORIZED_LIMIT}.`),
  offset: z.number().int().nonnegative().optional().describe("Merchant groups to skip, for pagination. Defaults to 0."),
};

export function registerListUncategorizedTool(server: McpServer): void {
  server.registerTool(
    "list_uncategorized",
    { title: "List uncategorized transactions by merchant", description: DESCRIPTION, inputSchema },
    async ({ limit, offset }) => {
      const result = listUncategorized(db, { limit, offset });

      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
