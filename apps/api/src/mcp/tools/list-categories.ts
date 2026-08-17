import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { listCategories } from "../queries/list-categories.js";

const DESCRIPTION = `The category catalogue (id, name, emoji, type, active status). Call this before categorize, bulk_categorize, or create_rule to get a valid categoryId — those tools take an id, not a name, and will not invent or fuzzy-match one.

Excludes inactive (retired) categories by default; pass includeInactive: true to see the full catalogue.`;

const inputSchema = {
  includeInactive: z.boolean().optional().describe("Include retired categories. Defaults to false."),
};

export function registerListCategoriesTool(server: McpServer): void {
  server.registerTool(
    "list_categories",
    { title: "List categories", description: DESCRIPTION, inputSchema },
    async ({ includeInactive }) => {
      const result = listCategories(db, includeInactive ?? false);

      return {
        structuredContent: { categories: result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
