import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { DEFAULT_DASHBOARD_PATH, writeDashboard } from "../dashboard/write-dashboard.js";

const DESCRIPTION = `Renders a local, self-contained HTML spending dashboard and returns the path of the file it wrote. Opens it in the default browser on macOS unless told not to.

What the page shows: total spend, months covered, transaction count and % categorised for the selected period; spend by month, by category, by category and month, and by city; a year selector and a month filter; and a table view of every chart. Payments to the card are excluded, so totals tie out with monthly_summary (net spend minus its payment and pat sections). Uncategorised spending is its own bucket, never hidden.

Privacy: the file contains real spending data, so by default it is written OUTSIDE the repository to ${DEFAULT_DASHBOARD_PATH}. The page makes no network requests of any kind (no CDN, fonts or fetches) — everything is inlined — so nothing leaves the machine. Pass outputPath only to write somewhere else that is also not under version control.

The tool reports only the path and counts, never amounts.`;

const inputSchema = {
  outputPath: z
    .string()
    .min(1)
    .optional()
    .describe(`Where to write the HTML file ("~" is expanded; the directory is created). Defaults to ${DEFAULT_DASHBOARD_PATH}.`),
  open: z.boolean().optional().describe("Open the file in the default browser (macOS `open`). Defaults to true; pass false to only write it."),
};

export function registerRenderDashboardTool(server: McpServer): void {
  server.registerTool(
    "render_dashboard",
    { title: "Render spending dashboard", description: DESCRIPTION, inputSchema },
    async ({ outputPath, open }) => {
      const result = writeDashboard(db, { outputPath, open });
      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
