import { EFFECTIVE_SECTION_SQL } from "./section.js";

/**
 * The row filter shared by every pattern detector (`detect_recurring`,
 * `category_trend`, `detect_anomalies`): what counts as "spending" when
 * looking for patterns.
 *
 * - Projected rows are excluded: they are future instalment payments the
 *   parser derived, not something that was actually billed.
 * - Rows without a billing month cannot be placed on a timeline.
 * - `payment` and `pat` rows are excluded: money sent to the card itself is
 *   never spending, and would otherwise show up as the biggest "category".
 *
 * Unqualified column names, so it works against `transactions` aliased as
 * `t` or not, with or without a join to `categories`.
 */
export const SPENDING_ROW_FILTER = `
  is_projected = 0
  AND billing_month IS NOT NULL
  AND (${EFFECTIVE_SECTION_SQL}) NOT IN ('payment', 'pat')
`;

/**
 * Instalment rows repeat the same amount every month by construction, so a
 * detector that looks for repetition must leave them out.
 * `installment_total > 1` is what the parser persists for a plan, and it is
 * the only marker legacy rows (no `section`) still carry.
 */
export const NOT_INSTALMENT_FILTER = `
  COALESCE(section, '') <> 'installment'
  AND COALESCE(installment_total, 1) <= 1
`;

/** Latest billing month that has any (non-projected) rows, or null on an empty database. */
export const LATEST_BILLING_MONTH_SQL = `SELECT MAX(billing_month) AS month FROM transactions WHERE is_projected = 0 AND billing_month IS NOT NULL`;
