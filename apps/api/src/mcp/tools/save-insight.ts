import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { saveInsight } from "../insights/store.js";

const DESCRIPTION = `Saves something learned about how the owner spends — a convention, a pattern, a decision, a preference, or a warning worth remembering across sessions. This is the insight layer, separate from the transaction data: it holds interpretation, not raw numbers.

Content format:
- Write content as plain, self-contained English prose — a future reader (a model with no other context) must be able to act on it without re-deriving it from the raw transactions. State the conclusion first, then the evidence.
- Any money-adjacent value inside content must stay an exact integer CLP figure (Chilean pesos have no cents) — never invent or round a number, and never phrase it in a different currency.
- Cite concrete evidence where you have it: merchant names, row counts, date ranges, specific amounts. "Fuel purchases are always over 10,000 CLP and round" is useful; "fuel is expensive" is not.
- type is free-form but should stay consistent with existing values — typically one of: convention, pattern, decision, preference, warning.

topic_key (optional) makes this call an upsert: if an existing, non-deleted observation already has this exact topic_key, it is updated in place (content replaced, revisionCount incremented) instead of creating a new row. Use it for anything that evolves over time and should have exactly one current version — e.g. "this month's take on a recurring bill." Omit it for a one-off fact that should stand on its own.

Saving content identical (ignoring case/whitespace) to an existing, non-deleted observation never creates a duplicate row either — it bumps that observation's duplicateCount and lastSeenAt instead. You do not need to search first to avoid duplicating a save.`;

const inputSchema = {
  type: z.string().min(1).describe("Free-form observation type, e.g. convention, pattern, decision, preference, warning."),
  title: z.string().min(1).describe("Short, specific title — this is weighted highest in search relevance."),
  content: z.string().min(1).describe("The full observation: conclusion first, then evidence. Exact integer CLP for any money figure."),
  topicKey: z.string().min(1).optional().describe("Stable key that makes this save an upsert against any existing observation with the same key. Omit for a one-off fact."),
};

export function registerSaveInsightTool(server: McpServer): void {
  server.registerTool("save_insight", { title: "Save an insight", description: DESCRIPTION, inputSchema }, async ({ type, title, content, topicKey }) => {
    const result = saveInsight(db, { type, title, content, topicKey });

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
