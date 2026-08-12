import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerImportStatementsTool } from "./import-statements.js";

/**
 * Registers every tool this server exposes. Query, categorization and
 * analysis tools land here as their own `register*Tool` functions in later
 * work — this module is the one place that needs to change to add them,
 * the transport in `server.ts` never does.
 */
export function registerTools(server: McpServer): void {
  registerImportStatementsTool(server);
}
