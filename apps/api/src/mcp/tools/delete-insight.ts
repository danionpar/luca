import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { deleteInsight } from "../insights/store.js";

const DESCRIPTION = `Soft-deletes an insight: it is excluded from search_insights, list_insights and get_insight from then on, but the row and any relations it participates in are never physically removed — this is the owner's learned financial history.`;

const inputSchema = {
  id: z.number().int().describe("The observation id to delete."),
};

export function registerDeleteInsightTool(server: McpServer): void {
  server.registerTool("delete_insight", { title: "Delete an insight", description: DESCRIPTION, inputSchema }, async ({ id }) => {
    const result = deleteInsight(db, id);

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
