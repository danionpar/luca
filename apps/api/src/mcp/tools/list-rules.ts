import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { listRules } from "../categorization/rules.js";

const DESCRIPTION = `Every stored categorization rule, oldest first (the order ties resolve in favor of when more than one rule's pattern matches a merchant). Use this to review what's already automated before adding a new, possibly-overlapping create_rule.`;

export function registerListRulesTool(server: McpServer): void {
  server.registerTool("list_rules", { title: "List categorization rules", description: DESCRIPTION, inputSchema: {} }, async () => {
    const result = listRules(db);

    return {
      structuredContent: { rules: result },
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
