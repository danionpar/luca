import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { getInsight } from "../insights/store.js";

const DESCRIPTION = `Fetches one saved insight (observation) by id, in full and untruncated — use this after search_insights or list_insights returned a compact result you need the complete content for. Returns nothing for a soft-deleted or unknown id.`;

const inputSchema = {
  id: z.number().int().describe("The observation id, from search_insights or list_insights."),
};

export function registerGetInsightTool(server: McpServer): void {
  server.registerTool("get_insight", { title: "Get an insight", description: DESCRIPTION, inputSchema }, async ({ id }) => {
    const result = getInsight(db, id);

    return {
      structuredContent: (result ?? { found: false }) as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result ?? { found: false }, null, 2) }],
    };
  });
}
