import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerImportStatementsTool } from "./import-statements.js";
import { registerListTransactionsTool } from "./list-transactions.js";
import { registerMonthlySummaryTool } from "./monthly-summary.js";
import { registerSpendingByCategoryTool } from "./spending-by-category.js";
import { registerListCategoriesTool } from "./list-categories.js";
import { registerListUncategorizedTool } from "./list-uncategorized.js";
import { registerCategorizeTool } from "./categorize.js";
import { registerBulkCategorizeTool } from "./bulk-categorize.js";
import { registerCreateRuleTool } from "./create-rule.js";
import { registerListRulesTool } from "./list-rules.js";
import { registerDeleteRuleTool } from "./delete-rule.js";
import { registerProjectedCommitmentsTool } from "./projected-commitments.js";

/**
 * Registers every tool this server exposes. This is the one place that
 * needs to change to add a tool — the transport in `server.ts` never does.
 */
export function registerTools(server: McpServer): void {
  registerImportStatementsTool(server);

  registerListTransactionsTool(server);
  registerMonthlySummaryTool(server);
  registerSpendingByCategoryTool(server);
  registerListCategoriesTool(server);

  registerListUncategorizedTool(server);
  registerCategorizeTool(server);
  registerBulkCategorizeTool(server);
  registerCreateRuleTool(server);
  registerListRulesTool(server);
  registerDeleteRuleTool(server);

  registerProjectedCommitmentsTool(server);
}
