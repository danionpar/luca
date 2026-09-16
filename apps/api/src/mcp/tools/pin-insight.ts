import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { pinInsight } from "../insights/store.js";

const DESCRIPTION = `Pins an insight so it always sorts first in list_insights, regardless of recency — use it for something that should stay top-of-mind (e.g. a standing convention like "payments are never categorised").`;

const inputSchema = {
  id: z.number().int().describe("The observation id to pin."),
};

export function registerPinInsightTool(server: McpServer): void {
  server.registerTool("pin_insight", { title: "Pin an insight", description: DESCRIPTION, inputSchema }, async ({ id }) => {
    const result = pinInsight(db, id);

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
