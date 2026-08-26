import type { MatchableRule } from "../categorization/rule-matching.js";
import type { ParsedStatement } from "../../parsers/statement-text-parser.js";
import type { PersistStatementParams } from "./db-deps.js";
import type { StatementIdentity } from "./natural-key.js";
import { planImport } from "./plan.js";
import type { DiscoveredStatement, ImportSummary, StatementResult, UnparseableFile } from "./types.js";

export interface RunImportOptions {
  folderPath: string;
  dryRun: boolean;
  bank: string;
  password: string;
}

/**
 * Everything `runImport` needs from the outside world, as plain functions.
 * Production wiring (real filesystem, real parser, real SQLite) lives in
 * `live-deps.ts`; tests substitute synthetic statements and in-memory
 * bookkeeping so the reconciliation gate, duplicate detection and
 * chronological ordering can be verified without a real PDF or database.
 */
export interface RunImportDeps {
  discoverPdfPaths: (folderPath: string) => Promise<string[]>;
  parseStatement: (pdfPath: string, password: string) => Promise<ParsedStatement>;
  isStatementAlreadyImported: (identity: StatementIdentity) => boolean;
  isTransactionAlreadyImported: (referenceCode: string) => boolean;
  persistImportedStatement: (params: PersistStatementParams) => void;
  moveStatementFile: (filePath: string, rootFolder: string, outcome: "processed" | "failed") => Promise<string>;
  /** Loaded once per run and applied to every newly-mapped row, so imports arrive progressively categorized. */
  loadCategorizationRules: () => MatchableRule[];
}

/**
 * Runs one import batch over a folder: discover PDFs, parse each, decide
 * what happens to it (`planImport` — the reconciliation gate and duplicate
 * detection live there), then — unless `dryRun` — write to the database and
 * move the source file. Returns a summary; never throws for a single bad
 * statement, since one unparseable or unbalanced PDF must not block the
 * rest of the batch.
 */
export async function runImport(options: RunImportOptions, deps: RunImportDeps): Promise<ImportSummary> {
  const pdfPaths = await deps.discoverPdfPaths(options.folderPath);

  const discovered: DiscoveredStatement[] = [];
  const unparseable: UnparseableFile[] = [];

  for (const filePath of pdfPaths) {
    try {
      const statement = await deps.parseStatement(filePath, options.password);
      discovered.push({ filePath, statement });
    } catch (error) {
      unparseable.push({ filePath, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const planned = planImport(discovered, {
    bank: options.bank,
    isStatementAlreadyImported: deps.isStatementAlreadyImported,
    isTransactionAlreadyImported: deps.isTransactionAlreadyImported,
    rules: deps.loadCategorizationRules(),
  });

  const results: StatementResult[] = [];

  for (const plan of planned) {
    if (plan.decision.kind === "skip_duplicate") {
      const movedTo = options.dryRun ? null : await deps.moveStatementFile(plan.filePath, options.folderPath, "processed");
      results.push({
        filePath: plan.filePath,
        bank: plan.bank,
        cardLastFour: plan.cardLastFour,
        periodFrom: plan.periodFrom,
        periodTo: plan.periodTo,
        statementDate: plan.statementDate,
        status: "skipped_duplicate",
        transactionsImported: 0,
        transactionsSkippedDuplicate: 0,
        reconciliation: null,
        error: null,
        movedTo,
      });
      continue;
    }

    if (plan.decision.kind === "refuse_reconciliation") {
      const movedTo = options.dryRun ? null : await deps.moveStatementFile(plan.filePath, options.folderPath, "failed");
      results.push({
        filePath: plan.filePath,
        bank: plan.bank,
        cardLastFour: plan.cardLastFour,
        periodFrom: plan.periodFrom,
        periodTo: plan.periodTo,
        statementDate: plan.statementDate,
        status: "failed_reconciliation",
        transactionsImported: 0,
        transactionsSkippedDuplicate: 0,
        reconciliation: plan.decision.checks,
        error: "Statement does not reconcile against its own printed section totals.",
        movedTo,
      });
      continue;
    }

    // plan.decision.kind === "import"
    if (!options.dryRun) {
      deps.persistImportedStatement({
        bank: plan.bank,
        cardLastFour: plan.cardLastFour,
        periodFrom: plan.periodFrom,
        periodTo: plan.periodTo,
        statementDate: plan.statementDate,
        totalBilled: plan.totalBilled,
        rows: plan.decision.rows,
        ruleUsage: plan.decision.ruleUsage,
      });
    }
    const movedTo = options.dryRun ? null : await deps.moveStatementFile(plan.filePath, options.folderPath, "processed");
    results.push({
      filePath: plan.filePath,
      bank: plan.bank,
      cardLastFour: plan.cardLastFour,
      periodFrom: plan.periodFrom,
      periodTo: plan.periodTo,
      statementDate: plan.statementDate,
      status: "imported",
      transactionsImported: plan.decision.rows.length,
      transactionsSkippedDuplicate: plan.decision.duplicateTransactions,
      reconciliation: null,
      error: null,
      movedTo,
    });
  }

  for (const { filePath, reason } of unparseable) {
    const movedTo = options.dryRun ? null : await deps.moveStatementFile(filePath, options.folderPath, "failed");
    results.push({
      filePath,
      bank: null,
      cardLastFour: null,
      periodFrom: null,
      periodTo: null,
      statementDate: null,
      status: "failed_parse",
      transactionsImported: 0,
      transactionsSkippedDuplicate: 0,
      reconciliation: null,
      error: reason,
      movedTo,
    });
  }

  return {
    dryRun: options.dryRun,
    folderPath: options.folderPath,
    statementsFound: pdfPaths.length,
    imported: results.filter((r) => r.status === "imported").length,
    skippedDuplicate: results.filter((r) => r.status === "skipped_duplicate").length,
    failed: results.filter((r) => r.status === "failed_reconciliation" || r.status === "failed_parse").length,
    transactionsImported: results.reduce((sum, r) => sum + r.transactionsImported, 0),
    transactionsSkippedDuplicate: results.reduce((sum, r) => sum + r.transactionsSkippedDuplicate, 0),
    results,
  };
}
