import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { proposeAnomalies } from "../insights/detector-proposals.js";
import {
  DEFAULT_DEVIATION_THRESHOLD,
  DEFAULT_MIN_DELTA,
  DEFAULT_MIN_HISTORY_MONTHS,
  DEFAULT_TRAILING_MONTHS,
  detectAnomalies,
} from "../queries/detect-anomalies.js";

const DESCRIPTION = `Finds categories whose total for a billing month deviates from their trailing average. Every figure is computed by SQL.

For each category it compares the month's total with the average of the trailing window (default ${DEFAULT_TRAILING_MONTHS} months before it) and reports value, trailing average, delta, ratio and whether it is above or below. A category is flagged when the deviation is larger than threshold (default 50% of the average) AND at least minDelta CLP (default ${DEFAULT_MIN_DELTA.toLocaleString("en-US")}), so small categories are not flagged on noise.

Thin series are never flagged: a category needs spend in at least minHistoryMonths trailing months (default ${DEFAULT_MIN_HISTORY_MONTHS}). Months before the first ever billing month are not counted as zero. Uncategorised is its own series. Excludes projected rows and the payment section; pat rows (automatic bill payments) count as spending.

Defaults to the latest billing month with data.

Proposals: with saveAsInsights true, each anomaly is written to the insight layer as a PROPOSAL (type warning) awaiting the owner's confirmation, under a stable topic key (anomaly/<month>/<category-id>) so reruns update the same observation. It never creates rules or categorises anything. Default false (read-only).`;

const inputSchema = {
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("Billing month to inspect, YYYY-MM. Defaults to the latest month with data."),
  trailingMonths: z.number().int().min(1).max(36).default(DEFAULT_TRAILING_MONTHS).describe("Months before billingMonth that form the trailing window."),
  minHistoryMonths: z.number().int().min(1).max(36).default(DEFAULT_MIN_HISTORY_MONTHS).describe("Minimum trailing months with spend before a category can be flagged."),
  threshold: z.number().min(0).max(10).default(DEFAULT_DEVIATION_THRESHOLD).describe("Relative deviation from the trailing average that counts, e.g. 0.5 = 50%."),
  minDelta: z.number().int().min(0).default(DEFAULT_MIN_DELTA).describe("Minimum absolute deviation in CLP."),
  saveAsInsights: z.boolean().default(false).describe("Write each anomaly into the insight layer as a proposal. Default false."),
};

export function registerDetectAnomaliesTool(server: McpServer): void {
  server.registerTool(
    "detect_anomalies",
    { title: "Detect spending anomalies", description: DESCRIPTION, inputSchema },
    async ({ billingMonth, trailingMonths, minHistoryMonths, threshold, minDelta, saveAsInsights }) => {
      const result = detectAnomalies(db, { billingMonth, trailingMonths, minHistoryMonths, threshold, minDelta });
      const output = { ...result, ...(saveAsInsights ? { insights: proposeAnomalies(db, result) } : {}) };

      return {
        structuredContent: output as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
      };
    },
  );
}
