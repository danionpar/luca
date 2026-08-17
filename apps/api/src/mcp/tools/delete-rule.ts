import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { deleteRule } from "../categorization/rules.js";

const DESCRIPTION = `Deletes a stored categorization rule by id. Transactions it previously categorized are left exactly as they are — deleting a rule never uncategorizes anything, it only stops future imports from applying that rule.

Returns { ruleId, deleted } — deleted is false if the id did not exist.`;

const inputSchema = {
  ruleId: z.string().describe("The rule id, from list_rules."),
};

export function registerDeleteRuleTool(server: McpServer): void {
  server.registerTool("delete_rule", { title: "Delete a categorization rule", description: DESCRIPTION, inputSchema }, async ({ ruleId }) => {
    const result = deleteRule(db, ruleId);

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
