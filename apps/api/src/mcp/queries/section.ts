/**
 * How a row's statement section is determined for query purposes.
 *
 * Every transaction imported from here on has an exact `section` value,
 * copied straight from the parser's own classification (see
 * `map-transaction.ts`) — never guessed from amount sign or installment
 * counts. Rows imported before the `section` column existed have it as
 * NULL, and for those there is no reliable way to tell a manual payment
 * apart from a PAT, or a card fee apart from a single purchase: the
 * distinction was never persisted and amount sign alone cannot recover it
 * (a PAT and a refund can both be negative, a fee and a purchase can both
 * be positive).
 *
 * What CAN still be recovered for legacy rows without guessing is whether
 * a row is part of an installment plan, since `installment_total` was
 * already persisted before `section` existed: `installment_total > 1` is
 * definitionally an installment payment, independent of the missing
 * `section` value. So legacy rows fall back to `installment` when the
 * installment columns say so, and to `legacy_unclassified` otherwise —
 * surfaced explicitly as its own bucket rather than silently folded into
 * `single`, `charge`, `payment` or `pat`.
 */
export const EFFECTIVE_SECTION_SQL = `
  CASE
    WHEN section IS NOT NULL THEN section
    WHEN installment_total IS NOT NULL AND installment_total > 1 THEN 'installment'
    ELSE 'legacy_unclassified'
  END
`;

export type EffectiveSection = "single" | "installment" | "charge" | "payment" | "pat" | "legacy_unclassified";
