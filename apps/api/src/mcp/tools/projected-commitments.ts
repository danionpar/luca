import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { projectedCommitments } from "../queries/projected-commitments.js";

const DESCRIPTION = `Projects future installment obligations — how much is still owed on open installment plans, month by month. Computed fresh on every call from the current installment_current/installment_total on each transaction; nothing is stored, and the ledger is never written to (it holds only what a statement actually billed).

What it returns by default: openInstallmentPlans (how many purchases still have payments left), totalRemaining (sum of every future installment across all of them), and months (a soonest-first list of { billingMonth, total, count }).

Pass includeDetail: true to also get the per-installment breakdown (merchant, category, amount, which installment number, projected billing month) behind a details array — omitted by default to keep the response to the summary a "can I afford X in October" question actually needs.

A plan is identified by (merchant, original purchase date, installment total, per-installment amount) since no explicit plan id is stored; in the rare case two distinct purchases share all four exactly, they would be treated as one plan.`;

const inputSchema = {
  includeDetail: z.boolean().optional().describe("Include the per-installment breakdown. Defaults to false."),
};

export function registerProjectedCommitmentsTool(server: McpServer): void {
  server.registerTool(
    "projected_commitments",
    { title: "Projected future installment commitments", description: DESCRIPTION, inputSchema },
    async ({ includeDetail }) => {
      const result = projectedCommitments(db, { includeDetail });

      return {
        structuredContent: result as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
