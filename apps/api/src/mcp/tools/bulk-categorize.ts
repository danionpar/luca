import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { bulkCategorize } from "../categorization/bulk-categorize.js";

const DESCRIPTION = `Assigns one category to every transaction whose merchant contains merchantPattern (case-insensitive substring), in one call — the fast path for clearing a merchant group surfaced by list_uncategorized.

Always reports how many rows match (matched) before anything else. Pass dryRun: true first to see that count without writing — recommended for any new pattern, since a pattern that is too broad (a common word, a short fragment) can match more merchants than intended.

Pass onlyUncategorized: true to only touch rows that currently have no category, leaving any already-categorized row untouched.

For a pattern worth reusing on every future import (not just today's backlog), use create_rule instead — bulk_categorize only affects transactions that already exist.`;

const inputSchema = {
  merchantPattern: z.string().min(1).describe("Case-insensitive substring to match against the merchant name."),
  categoryId: z.string().describe("A valid category id from list_categories."),
  dryRun: z.boolean().optional().describe("When true, reports the match count and writes nothing. Defaults to false."),
  onlyUncategorized: z.boolean().optional().describe("When true, only touches currently-uncategorized rows. Defaults to false."),
};

export function registerBulkCategorizeTool(server: McpServer): void {
  server.registerTool(
    "bulk_categorize",
    { title: "Bulk-categorize by merchant pattern", description: DESCRIPTION, inputSchema },
    async ({ merchantPattern, categoryId, dryRun, onlyUncategorized }) => {
      const result = bulkCategorize(db, { merchantPattern, categoryId, dryRun, onlyUncategorized });

      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
