import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { searchInsights } from "../insights/store.js";

const DESCRIPTION = `Full-text search over saved insights (observations), ranked by relevance — title matches rank highest, then topic_key, then the body content. Soft-deleted observations are never returned.

Results are compact by design (progressive disclosure): each result carries a short highlighted excerpt, not the full content. Call get_insight with the id to read an observation in full before acting on it.

Any relations already judged for a result (via link_insights) are attached as "relations" — e.g. a result may already carry a not_conflict or supersedes verdict against another observation, so you see the verdict at a glance instead of needing a separate lookup.`;

const inputSchema = {
  query: z.string().min(1).describe("Search text. Multiple words are ANDed together."),
  limit: z.number().int().positive().max(100).optional().describe("Max results to return. Defaults to 10."),
};

export function registerSearchInsightsTool(server: McpServer): void {
  server.registerTool("search_insights", { title: "Search insights", description: DESCRIPTION, inputSchema }, async ({ query, limit }) => {
    const result = searchInsights(db, { query, limit });

    return {
      structuredContent: { results: result },
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
