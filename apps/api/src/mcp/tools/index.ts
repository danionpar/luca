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
import { registerSaveInsightTool } from "./save-insight.js";
import { registerSearchInsightsTool } from "./search-insights.js";
import { registerGetInsightTool } from "./get-insight.js";
import { registerLinkInsightsTool } from "./link-insights.js";
import { registerListInsightsTool } from "./list-insights.js";
import { registerPinInsightTool } from "./pin-insight.js";
import { registerUnpinInsightTool } from "./unpin-insight.js";
import { registerDeleteInsightTool } from "./delete-insight.js";
import { registerDetectRecurringTool } from "./detect-recurring.js";
import { registerCategoryTrendTool } from "./category-trend.js";
import { registerDetectAnomaliesTool } from "./detect-anomalies.js";
import { registerRenderDashboardTool } from "./render-dashboard.js";

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

  registerSaveInsightTool(server);
  registerSearchInsightsTool(server);
  registerGetInsightTool(server);
  registerLinkInsightsTool(server);
  registerListInsightsTool(server);
  registerPinInsightTool(server);
  registerUnpinInsightTool(server);
  registerDeleteInsightTool(server);

  registerDetectRecurringTool(server);
  registerCategoryTrendTool(server);
  registerDetectAnomaliesTool(server);

  registerRenderDashboardTool(server);
}
