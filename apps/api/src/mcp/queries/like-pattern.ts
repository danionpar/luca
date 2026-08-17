/**
 * Builds a SQL `LIKE` pattern for "merchant contains this substring",
 * escaping SQL wildcard characters (`%`, `_`, and the escape character
 * itself) so a merchant name that happens to contain one of them is matched
 * literally rather than as a wildcard. Always pair with `LIKE ? ESCAPE '\'`.
 */
export function containsPattern(substring: string): string {
  const escaped = substring.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}
