import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { categorize } from "../categorization/categorize.js";

const DESCRIPTION = `Assigns one category to a specific, known list of transaction ids. Overwrites any category already set on those rows.

Use this only when the exact ids are already known (e.g. from list_transactions or list_uncategorized row output). For "every transaction from this merchant", use bulk_categorize instead — categorizing 1000+ rows one id at a time here is the slow path list_uncategorized exists to avoid.

Returns { requested, updated } — updated can be less than requested if an id did not exist.`;

const inputSchema = {
  transactionIds: z.array(z.string()).min(1).describe("The exact transaction ids to categorize."),
  categoryId: z.string().describe("A valid category id from list_categories."),
};

export function registerCategorizeTool(server: McpServer): void {
  server.registerTool("categorize", { title: "Categorize specific transactions", description: DESCRIPTION, inputSchema }, async ({ transactionIds, categoryId }) => {
    const result = categorize(db, transactionIds, categoryId);

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
