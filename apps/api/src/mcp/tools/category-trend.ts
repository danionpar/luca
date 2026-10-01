import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { proposeTrends } from "../insights/detector-proposals.js";
import { DEFAULT_FLAT_THRESHOLD, DEFAULT_TREND_MONTHS, categoryTrend } from "../queries/category-trend.js";

const DESCRIPTION = `Per-category monthly totals over a window of billing months, each series labelled rising, falling or flat. Every figure, including the slope, is computed by SQL.

Direction comes from the least-squares slope of the monthly totals. A series is "flat" when its slope is within flatThreshold (default 5%) of its mean monthly total; otherwise it is rising or falling. Months with no spend count as zero, so a category that stopped or started shows up as a trend. Uncategorised spending is its own series (categoryId null) and is never hidden: how much is still unclassified is part of the picture.

Counts instalment rows (they are billed spending). Excludes projected rows and the payment and pat sections (money paid to the card is not spending).

Window: months (default ${DEFAULT_TREND_MONTHS}, minimum 3) ending at toMonth (default: the latest month with data).

Proposals: with saveAsInsights true, each rising or falling series is written to the insight layer as a PROPOSAL awaiting the owner's confirmation, under a stable per-category topic key (trend/<category-id>) so reruns revise the same observation. It never creates rules or categorises anything. Default false (read-only).`;

const inputSchema = {
  months: z.number().int().min(3).max(36).default(DEFAULT_TREND_MONTHS).describe("Billing months in the window."),
  toMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("Last billing month of the window, YYYY-MM. Defaults to the latest month with data."),
  flatThreshold: z.number().min(0).max(1).default(DEFAULT_FLAT_THRESHOLD).describe("Slope within this fraction of the mean monthly total counts as flat."),
  saveAsInsights: z.boolean().default(false).describe("Write rising/falling series into the insight layer as proposals. Default false."),
};

export function registerCategoryTrendTool(server: McpServer): void {
  server.registerTool("category_trend", { title: "Category spending trend", description: DESCRIPTION, inputSchema }, async ({ months, toMonth, flatThreshold, saveAsInsights }) => {
    const result = categoryTrend(db, { months, toMonth, flatThreshold });
    const output = { ...result, ...(saveAsInsights ? { insights: proposeTrends(db, result) } : {}) };

    return {
      structuredContent: output as unknown as Record<string, unknown>,
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    };
  });
}
