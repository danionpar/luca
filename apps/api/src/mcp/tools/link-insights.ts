import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { relationTypes } from "../../db/schema.js";
import { linkInsights } from "../insights/store.js";

const DESCRIPTION = `Creates a judged relation between two saved insights (observations) — e.g. one observation supersedes an older one, or two independently-reached conclusions turn out not to conflict.

relation must be one of the locked vocabulary: related, compatible, scoped, conflicts_with, supersedes, not_conflict. "pending" is not accepted here — it is an internal judgment state, never a verb you choose.

reason, evidence and confidence are all required: this tool only ever creates a judged link, never a bare unjudged guess. reason explains why this relation holds; evidence cites the concrete facts (figures, dates, rows) behind it; confidence is 0.0-1.0.`;

const inputSchema = {
  sourceId: z.number().int().describe("The first observation's id."),
  targetId: z.number().int().describe("The second observation's id."),
  relation: z.enum(relationTypes).describe("One of: related, compatible, scoped, conflicts_with, supersedes, not_conflict."),
  reason: z.string().min(1).describe("Why this relation holds between the two observations."),
  evidence: z.string().min(1).describe("The concrete evidence backing the relation."),
  confidence: z.number().min(0).max(1).describe("0.0-1.0 confidence in this judgment."),
};

export function registerLinkInsightsTool(server: McpServer): void {
  server.registerTool("link_insights", { title: "Link two insights", description: DESCRIPTION, inputSchema }, async ({ sourceId, targetId, relation, reason, evidence, confidence }) => {
    const result = linkInsights(db, { sourceId, targetId, relation, reason, evidence, confidence });

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
