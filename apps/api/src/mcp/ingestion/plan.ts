import type { MatchableRule } from "../categorization/rule-matching.js";
import { buildStatementNaturalKey } from "./natural-key.js";
import type { StatementIdentity } from "./natural-key.js";
import { mapTransactionRow } from "./map-transaction.js";
import { applyRulesToRows } from "./rule-application.js";
import type { DiscoveredStatement, PlannedStatement } from "./types.js";

/**
 * Oldest-first by the statement date read from the PDF content, so a batch
 * import always builds history forward in time and a re-run over the same
 * folder produces the same order. Folder/file names are never consulted.
 */
export function sortStatementsChronologically(statements: DiscoveredStatement[]): DiscoveredStatement[] {
  return [...statements].sort((a, b) => a.statement.statementDate.localeCompare(b.statement.statementDate));
}

/**
 * The persistence checks `planImport` needs, kept as plain callbacks so the
 * planning logic itself never touches a database or filesystem and can be
 * exercised with synthetic statements.
 */
export interface PlanContext {
  bank: string;
  isStatementAlreadyImported: (identity: StatementIdentity) => boolean;
  isTransactionAlreadyImported: (referenceCode: string) => boolean;
  /**
   * Stored categorization rules, applied to every newly-mapped row so each
   * import arrives progressively cleaner. Defaults to none, so callers that
   * don't care about categorization (most existing tests) don't have to
   * thread an empty array through.
   */
  rules?: MatchableRule[];
}

/**
 * Decides what should happen to every discovered statement, in chronological
 * order. This is the single place the ingestion rules from the spec live:
 *
 * 1. A statement whose natural key (bank + card + period) was already
 *    imported — either in a previous run, or earlier in this same batch —
 *    is skipped as a duplicate. Nothing about it is re-evaluated.
 * 2. A statement that does not reconcile against its own printed section
 *    totals is refused outright. No partial import: either every row goes
 *    in, or none do.
 * 3. Otherwise every transaction is staged for import, except one whose
 *    reference code was already imported — again either previously or
 *    earlier in this batch — which is counted as a duplicate transaction
 *    and dropped rather than inserted twice.
 *
 * Statements and transactions accepted earlier in the loop become
 * "already imported" for the purpose of every statement that follows, so a
 * folder that (accidentally or not) contains the same PDF twice only ever
 * imports it once.
 */
export function planImport(statements: DiscoveredStatement[], ctx: PlanContext): PlannedStatement[] {
  const ordered = sortStatementsChronologically(statements);
  const seenStatementKeys = new Set<string>();
  const seenReferenceCodes = new Set<string>();
  const results: PlannedStatement[] = [];

  for (const { filePath, statement } of ordered) {
    const identity: StatementIdentity = {
      bank: ctx.bank,
      cardLastFour: statement.cardLastFour,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
    };
    const naturalKey = buildStatementNaturalKey(identity);

    const base = {
      filePath,
      bank: ctx.bank,
      cardLastFour: statement.cardLastFour,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
      statementDate: statement.statementDate,
      totalBilled: statement.totalBilled,
    };

    if (seenStatementKeys.has(naturalKey) || ctx.isStatementAlreadyImported(identity)) {
      results.push({ ...base, decision: { kind: "skip_duplicate" } });
      continue;
    }

    if (!statement.reconciliation.balanced) {
      results.push({ ...base, decision: { kind: "refuse_reconciliation", checks: statement.reconciliation.checks } });
      continue;
    }

    const rows = [];
    let duplicateTransactions = 0;
    for (const tx of statement.transactions) {
      if (seenReferenceCodes.has(tx.referenceCode) || ctx.isTransactionAlreadyImported(tx.referenceCode)) {
        duplicateTransactions++;
        continue;
      }
      seenReferenceCodes.add(tx.referenceCode);
      rows.push(mapTransactionRow(ctx.bank, statement, tx));
    }

    seenStatementKeys.add(naturalKey);
    results.push({ ...base, decision: { kind: "import", rows: applyRulesToRows(rows, ctx.rules ?? []), duplicateTransactions } });
  }

  return results;
}
