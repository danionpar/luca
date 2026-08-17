import type { MatchableRule } from "../categorization/rule-matching.js";
import { pickMatchingRule } from "../categorization/rule-matching.js";
import type { NewTransactionRow } from "./map-transaction.js";

/**
 * Applies the stored categorization rules to freshly-mapped rows before
 * they are persisted, so every `import_statements` run arrives progressively
 * cleaner instead of dumping another batch of uncategorized transactions.
 *
 * A row whose merchant matches no rule is left exactly as `mapTransactionRow`
 * produced it (`categoryId: null`). Resolution when more than one rule
 * matches is `pickMatchingRule`'s: most specific pattern wins, ties broken
 * by the oldest rule.
 */
export function applyRulesToRows(rows: NewTransactionRow[], rules: MatchableRule[]): NewTransactionRow[] {
  if (rules.length === 0) return rows;

  return rows.map((row) => {
    const match = pickMatchingRule(row.merchant, rules);
    return match ? { ...row, categoryId: match.categoryId } : row;
  });
}
