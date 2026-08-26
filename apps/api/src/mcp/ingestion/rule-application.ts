import type { MatchableRule } from "../categorization/rule-matching.js";
import { pickMatchingRule } from "../categorization/rule-matching.js";
import type { NewTransactionRow } from "./map-transaction.js";

export interface RuleApplicationResult {
  rows: NewTransactionRow[];
  /**
   * How many rows each rule (keyed by rule id) categorized in this call.
   * A rule that matched nothing has no entry at all — never a zero one —
   * so callers can iterate this to know exactly which rules to credit, and
   * by how much, without inspecting every row again.
   */
  ruleUsage: Record<string, number>;
}

/**
 * Applies the stored categorization rules to freshly-mapped rows before
 * they are persisted, so every `import_statements` run arrives progressively
 * cleaner instead of dumping another batch of uncategorized transactions.
 *
 * A row whose merchant matches no rule is left exactly as `mapTransactionRow`
 * produced it (`categoryId: null`). Resolution when more than one rule
 * matches is `pickMatchingRule`'s: most specific pattern wins, ties broken
 * by `timesUsed`, remaining ties broken by the oldest rule.
 *
 * The returned `ruleUsage` tells the caller how many rows each rule
 * actually categorized in this call, so `timesUsed` can be incremented by
 * that count in one write per rule rather than one per row.
 */
export function applyRulesToRows(rows: NewTransactionRow[], rules: MatchableRule[]): RuleApplicationResult {
  if (rules.length === 0) return { rows, ruleUsage: {} };

  const ruleUsage: Record<string, number> = {};
  const mappedRows = rows.map((row) => {
    const match = pickMatchingRule(row.merchant, rules);
    if (!match) return row;
    ruleUsage[match.id] = (ruleUsage[match.id] ?? 0) + 1;
    return { ...row, categoryId: match.categoryId };
  });

  return { rows: mappedRows, ruleUsage };
}
