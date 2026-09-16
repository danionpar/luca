import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { listInsights } from "../insights/store.js";

const DESCRIPTION = `Lists saved insights (observations), pinned first, then most-recently-seen. Use this to review what the tool already knows before saving something that might already be recorded. Soft-deleted observations are never returned.`;

const inputSchema = {
  limit: z.number().int().positive().max(200).optional().describe("Max results to return. Defaults to 20."),
  pinnedOnly: z.boolean().optional().describe("When true, only pinned observations are returned."),
};

export function registerListInsightsTool(server: McpServer): void {
  server.registerTool("list_insights", { title: "List insights", description: DESCRIPTION, inputSchema }, async ({ limit, pinnedOnly }) => {
    const result = listInsights(db, { limit, pinnedOnly });

    return {
      structuredContent: { insights: result },
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
