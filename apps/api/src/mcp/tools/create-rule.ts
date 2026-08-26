import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { createRule } from "../categorization/rules.js";

const DESCRIPTION = `Persists a merchant-pattern-to-category rule. Every future import_statements run applies all stored rules to newly imported transactions automatically, so each import arrives progressively cleaner instead of adding to the uncategorized pile again.

If more than one rule's pattern matches a merchant, the most specific (longest) pattern wins; ties are broken by whichever rule has categorized more transactions so far (timesUsed); any still-tied rules are resolved by the oldest one.

A freshly created rule starts at timesUsed: 0 — it hasn't categorized anything yet. Pass applyToExisting: true to also apply it right now to transactions that already exist — but only ones that are currently uncategorized. It deliberately never overwrites a transaction that already has a different category (that may have been set on purpose); use bulk_categorize directly for an override. When applyToExisting does match existing rows, timesUsed is set to exactly how many it touched, so it never lies about what the rule has actually done.

Prefer create_rule over a one-off bulk_categorize when the same merchant is expected to recur — a rule keeps working on every future statement, a bulk_categorize call only affects what exists today.`;

const inputSchema = {
  merchantPattern: z.string().min(1).describe("Case-insensitive substring to match against future (and, optionally, existing) transactions' merchant name."),
  categoryId: z.string().describe("A valid category id from list_categories."),
  applyToExisting: z
    .boolean()
    .optional()
    .describe("When true, immediately categorizes existing transactions that match and are currently uncategorized. Defaults to false."),
};

export function registerCreateRuleTool(server: McpServer): void {
  server.registerTool("create_rule", { title: "Create a categorization rule", description: DESCRIPTION, inputSchema }, async ({ merchantPattern, categoryId, applyToExisting }) => {
    const result = createRule(db, { merchantPattern, categoryId, applyToExisting });

    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
