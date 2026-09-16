import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { unpinInsight } from "../insights/store.js";

const DESCRIPTION = `Unpins a previously-pinned insight, so it goes back to sorting by recency alone in list_insights.`;

const inputSchema = {
  id: z.number().int().describe("The observation id to unpin."),
};

export function registerUnpinInsightTool(server: McpServer): void {
  server.registerTool("unpin_insight", { title: "Unpin an insight", description: DESCRIPTION, inputSchema }, async ({ id }) => {
    const result = unpinInsight(db, id);

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
