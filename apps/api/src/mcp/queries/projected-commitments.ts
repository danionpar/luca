import type { LucaDb } from "./db-types.js";
import { runQuery } from "./raw-sql.js";
import { shiftYearMonth } from "./year-month.js";

interface OpenInstallmentPlanRow {
  merchant: string | null;
  categoryId: string | null;
  transactionDate: string;
  installmentTotal: number;
  installmentCurrent: number;
  amount: number;
  billingMonth: string;
}

export interface ProjectedCommitmentDetail {
  merchant: string | null;
  categoryId: string | null;
  amount: number;
  /** 1-based position within the remaining installments, e.g. 1 of 3 still owed. */
  installmentNumber: number;
  installmentTotal: number;
  projectedBillingMonth: string;
}

export interface ProjectedMonthTotal {
  billingMonth: string;
  total: number;
  count: number;
}

export interface ProjectedCommitmentsResult {
  /** How many distinct installment plans still have payments left. */
  openInstallmentPlans: number;
  /** Sum of every future installment across every open plan. */
  totalRemaining: number;
  /** Per future billing month, biggest first in time order (soonest first). */
  months: ProjectedMonthTotal[];
  /** Per-installment detail, only present when `includeDetail` is true. */
  details?: ProjectedCommitmentDetail[];
}

/**
 * Projects future installment obligations — computed fresh on every call,
 * never stored. Nothing here is written back to `transactions`: the ledger
 * only ever holds what a statement actually billed.
 *
 * For each purchase still mid-installment-plan, this takes its most
 * recently billed occurrence (the row with the highest
 * `installment_current` for that plan) and projects the remaining
 * installments forward one billing month at a time, at the same amount as
 * the last billed installment. A "plan" is identified by
 * (merchant, original purchase date, installment total, per-installment
 * amount) — the closest stable identity available from persisted columns,
 * since no explicit plan id exists. This can, in principle, conflate two
 * distinct purchases that coincidentally share all four values; accepted as
 * a rare edge case for personal use.
 *
 * Pass `includeDetail: true` to also get the per-installment breakdown;
 * by default only the month-by-month totals are returned, following the
 * summary-first shape the other tools use.
 */
export function projectedCommitments(db: LucaDb, options: { includeDetail?: boolean } = {}): ProjectedCommitmentsResult {
  const openPlans = runQuery<OpenInstallmentPlanRow>(
    db,
    `
    WITH ranked AS (
      SELECT
        merchant,
        category_id as categoryId,
        transaction_date as transactionDate,
        installment_total as installmentTotal,
        installment_current as installmentCurrent,
        amount,
        billing_month as billingMonth,
        ROW_NUMBER() OVER (
          PARTITION BY merchant, transaction_date, installment_total, amount
          ORDER BY installment_current DESC
        ) as rn
      FROM transactions
      WHERE installment_total IS NOT NULL
        AND installment_total > 1
        AND installment_current IS NOT NULL
        AND billing_month IS NOT NULL
    )
    SELECT merchant, categoryId, transactionDate, installmentTotal, installmentCurrent, amount, billingMonth
    FROM ranked
    WHERE rn = 1 AND installmentCurrent < installmentTotal
    `,
  );

  const details: ProjectedCommitmentDetail[] = [];
  for (const plan of openPlans) {
    const remaining = plan.installmentTotal - plan.installmentCurrent;
    for (let i = 1; i <= remaining; i++) {
      details.push({
        merchant: plan.merchant,
        categoryId: plan.categoryId,
        amount: plan.amount,
        installmentNumber: i,
        installmentTotal: plan.installmentTotal,
        projectedBillingMonth: shiftYearMonth(plan.billingMonth, i),
      });
    }
  }

  const byMonth = new Map<string, { total: number; count: number }>();
  for (const detail of details) {
    const existing = byMonth.get(detail.projectedBillingMonth) ?? { total: 0, count: 0 };
    existing.total += detail.amount;
    existing.count += 1;
    byMonth.set(detail.projectedBillingMonth, existing);
  }

  const months: ProjectedMonthTotal[] = [...byMonth.entries()]
    .map(([billingMonth, { total, count }]) => ({ billingMonth, total, count }))
    .sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));

  return {
    openInstallmentPlans: openPlans.length,
    totalRemaining: details.reduce((sum, d) => sum + d.amount, 0),
    months,
    ...(options.includeDetail ? { details } : {}),
  };
}
