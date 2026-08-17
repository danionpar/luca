import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BANK_ID } from "../ingestion/constants.js";
import { createLiveImportDeps } from "../ingestion/live-deps.js";
import { runImport } from "../ingestion/run-import.js";

const DESCRIPTION = `Imports Banco de Chile credit card statement PDFs from a folder into the local SQLite ledger.

What it does:
- Recursively scans the given folder for .pdf files. Folder and file names are never interpreted — the card, billing period and statement date all come from each PDF's own printed content, which is the only source of truth for what a statement covers.
- Processes statements oldest-first, ordered by the statement date printed inside each PDF, so a run always builds history forward in time and re-running it is deterministic.
- Reconciles every statement against its own printed section totals (payments, automatic payments/PAT, single-purchase, installment) before importing anything from it. A statement that does not balance is REFUSED in full — none of its transactions are written — because a mismatch means the parser dropped or double-counted a line, and importing it anyway would silently corrupt the ledger. The per-section parsed-vs-printed deltas are returned so the mismatch can be diagnosed.
- Skips a statement whose bank + card + billing period was already imported in a previous run (or earlier in this same run, if the folder happens to contain it twice).
- Within a statement that does import, skips any individual transaction whose reference code is already in the ledger, so re-running this tool over a folder that still contains old PDFs never double-counts.
- Applies every stored categorization rule (see create_rule) to each newly imported row's merchant before it is written, so a run arrives progressively cleaner instead of adding to the uncategorized pile every time. When more than one rule matches, the most specific (longest) pattern wins, ties broken by the oldest rule. A row whose merchant matches no rule is left uncategorized, same as before.
- On success, moves the source PDF into a "processed" subfolder of the scanned folder. On failure (refused reconciliation, or a PDF that could not be parsed at all) it moves the file into a "failed" subfolder instead, together with the recorded reason. A duplicate statement is also filed into "processed", since it was already correctly imported once.

What it refuses to do, and why:
- It never imports a statement that fails its own reconciliation check, even partially — a statement's transactions go in as a whole, or not at all.
- It never interprets folder or file naming to decide a card, period, or date.
- It never deletes a source PDF. The PDF is the primary record and the database is derived from it; deleting the original while keeping only the derived rows would make a future parser fix or re-import impossible.
- It never assigns a category to an imported transaction. Categorization is a separate tool.

Dry run: pass dryRun: true to see exactly what a real run would do — every statement is still parsed and evaluated against the reconciliation and duplicate rules — but nothing is written to the database and no file is moved. Use this first on an unfamiliar folder.

Returns a compact summary: how many statements were found, imported, skipped as an already-imported duplicate, or failed (either refused for not reconciling, or unparseable); how many transactions were imported and how many were skipped as duplicates; and a per-statement result list giving each file's card, billing period, statement date, outcome, and — for a refused statement — the reconciliation deltas that caused the refusal.`;

const inputSchema = {
  folderPath: z
    .string()
    .min(1)
    .describe("Folder to scan recursively for statement PDFs. Its own 'processed' and 'failed' subfolders are skipped automatically when discovering files."),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, parse and evaluate every statement but write nothing to the database and move no files. Defaults to false."),
  password: z
    .string()
    .optional()
    .default("")
    .describe("PDF password, only needed if a statement is encrypted. Current Banco de Chile statements are not, so this defaults to an empty string."),
};

export function registerImportStatementsTool(server: McpServer): void {
  server.registerTool(
    "import_statements",
    {
      title: "Import bank statements",
      description: DESCRIPTION,
      inputSchema,
    },
    async ({ folderPath, dryRun, password }) => {
      const summary = await runImport(
        { folderPath, dryRun: dryRun ?? false, bank: BANK_ID, password: password ?? "" },
        createLiveImportDeps(),
      );

      return {
        structuredContent: summary as unknown as Record<string, unknown>,
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    },
  );
}
