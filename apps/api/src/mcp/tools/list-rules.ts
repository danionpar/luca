import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { listRules } from "../categorization/rules.js";

const DESCRIPTION = `Every stored categorization rule, oldest first (the order the last tiebreak resolves in favor of when more than one rule's pattern matches a merchant). Use this to review what's already automated before adding a new, possibly-overlapping create_rule.

Each rule includes timesUsed — how many transactions it has actually categorized, either immediately at creation (applyToExisting) or since, during import_statements runs. It only ever goes up; it is not a measure of recent activity, just total transactions categorized. A rule stuck at 0 has never matched anything and is worth checking for a typo'd or over-narrow pattern; the rules with the highest counts are the ones actually pulling their weight and the ones a specificity tie is resolved in favor of.`;

export function registerListRulesTool(server: McpServer): void {
  server.registerTool("list_rules", { title: "List categorization rules", description: DESCRIPTION, inputSchema: {} }, async () => {
    const result = listRules(db);

    return {
      structuredContent: { rules: result },
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
