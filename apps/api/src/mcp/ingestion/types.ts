import type { ParsedStatement, SectionReconciliation } from "../../parsers/statement-text-parser.js";
import type { NewTransactionRow } from "./map-transaction.js";

/**
 * A statement PDF that has already been parsed, paired with the path it was
 * read from. This is the seam between "walk the filesystem and run the real
 * parser" (I/O, exercised end-to-end) and "decide what to do with each
 * statement" (pure, unit-tested with synthetic statements).
 */
export interface DiscoveredStatement {
  filePath: string;
  statement: ParsedStatement;
}

/** A PDF that exists but could not be parsed at all (corrupt, wrong format, etc). */
export interface UnparseableFile {
  filePath: string;
  reason: string;
}

export type StatementDecision =
  | { kind: "skip_duplicate" }
  | { kind: "refuse_reconciliation"; checks: SectionReconciliation[] }
  | {
      kind: "import";
      rows: NewTransactionRow[];
      duplicateTransactions: number;
      /** How many rows each categorization rule (by id) categorized in this statement's rows — see `applyRulesToRows`. */
      ruleUsage: Record<string, number>;
    };

export interface PlannedStatement {
  filePath: string;
  bank: string;
  cardLastFour: string;
  periodFrom: string;
  periodTo: string;
  statementDate: string;
  totalBilled: number;
  decision: StatementDecision;
}

export type StatementOutcomeStatus = "imported" | "skipped_duplicate" | "failed_reconciliation" | "failed_parse";

export interface StatementResult {
  filePath: string;
  bank: string | null;
  cardLastFour: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  statementDate: string | null;
  status: StatementOutcomeStatus;
  transactionsImported: number;
  transactionsSkippedDuplicate: number;
  reconciliation: SectionReconciliation[] | null;
  error: string | null;
  movedTo: string | null;
}

export interface ImportSummary {
  dryRun: boolean;
  folderPath: string;
  statementsFound: number;
  imported: number;
  skippedDuplicate: number;
  failed: number;
  transactionsImported: number;
  transactionsSkippedDuplicate: number;
  results: StatementResult[];
}
