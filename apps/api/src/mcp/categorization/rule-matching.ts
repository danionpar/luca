/**
 * The plain data a categorization rule needs for matching — deliberately
 * not the drizzle row type, so this stays pure and testable without a
 * database.
 */
export interface MatchableRule {
  id: string;
  categoryId: string;
  merchantPattern: string;
  /** How many transactions this rule has categorized so far. Used as the second tiebreak — see `pickMatchingRule`. */
  timesUsed: number;
  createdAt: Date;
}

/**
 * Picks the rule that should decide a merchant's category when more than
 * one rule's pattern matches.
 *
 * Resolution order, both documented in `import_statements`' own tool
 * description:
 * 1. **Most specific pattern wins** — specificity is the pattern's length.
 *    "SUPERMERCADO LIDER" beats "LIDER" for a merchant string that contains
 *    both, because the longer pattern encodes more of the actual name and
 *    is less likely to accidentally catch an unrelated merchant.
 * 2. **Ties broken by the rule that has proven itself more** — if two
 *    patterns of equal length both match, the rule with the higher
 *    `timesUsed` wins, on the assumption that a rule that has already
 *    categorized more transactions is more likely to be the intended one.
 * 3. **Remaining ties broken by oldest rule** — if pattern length and
 *    `timesUsed` are both equal, the rule created first wins, on the
 *    assumption that an earlier rule reflects a decision already made and
 *    repeatedly relied upon, while a newer identical-standing rule is more
 *    likely a recent, less-tested addition.
 *
 * Matching itself is a case-insensitive substring test, same as
 * `bulk_categorize`. This resolution is fully deterministic: the three
 * criteria above are compared in strict order, so a given rule set and
 * merchant string always pick the same winner.
 */
export function pickMatchingRule(merchant: string | null | undefined, rules: MatchableRule[]): MatchableRule | null {
  if (!merchant) return null;
  const merchantLower = merchant.toLowerCase();

  const matches = rules.filter((rule) => merchantLower.includes(rule.merchantPattern.toLowerCase()));
  if (matches.length === 0) return null;

  return matches.reduce((best, candidate) => {
    if (candidate.merchantPattern.length !== best.merchantPattern.length) {
      return candidate.merchantPattern.length > best.merchantPattern.length ? candidate : best;
    }
    if (candidate.timesUsed !== best.timesUsed) {
      return candidate.timesUsed > best.timesUsed ? candidate : best;
    }
    return candidate.createdAt.getTime() < best.createdAt.getTime() ? candidate : best;
  });
}
