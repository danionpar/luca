import type { LucaDb } from "./db-types.js";
import { containsPattern } from "./like-pattern.js";
import { runQuery, runQueryOne } from "./raw-sql.js";
import { EFFECTIVE_SECTION_SQL } from "./section.js";
import type { EffectiveSection } from "./section.js";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export interface ListTransactionsFilters {
  /** The statement cycle (billing_month), e.g. "2026-03". Not the purchase date — see `dateFrom`/`dateTo`. */
  billingMonth?: string;
  /** Inclusive lower bound on the actual purchase date (transaction_date), YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive upper bound on the actual purchase date (transaction_date), YYYY-MM-DD. */
  dateTo?: string;
  categoryId?: string;
  /** Case-insensitive substring match against the merchant name. */
  merchantContains?: string;
  section?: EffectiveSection;
  type?: "income" | "expense" | "saving";
  uncategorizedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionRow {
  id: string;
  date: string;
  merchant: string | null;
  description: string | null;
  city: string | null;
  amount: number;
  categoryId: string | null;
  section: EffectiveSection;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  billingMonth: string | null;
}

export interface ListTransactionsResult {
  rows: TransactionRow[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildWhere(filters: ListTransactionsFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.billingMonth) {
    conditions.push("billing_month = ?");
    params.push(filters.billingMonth);
  }
  if (filters.dateFrom) {
    conditions.push("transaction_date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("transaction_date <= ?");
    params.push(filters.dateTo);
  }
  if (filters.categoryId) {
    conditions.push("category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.merchantContains) {
    conditions.push("merchant LIKE ? ESCAPE '\\'");
    params.push(containsPattern(filters.merchantContains));
  }
  if (filters.type) {
    conditions.push("type = ?");
    params.push(filters.type);
  }
  if (filters.uncategorizedOnly) {
    conditions.push("category_id IS NULL");
  }
  if (filters.section) {
    conditions.push(`(${EFFECTIVE_SECTION_SQL}) = ?`);
    params.push(filters.section);
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

/**
 * Lists transactions with the filters `list_transactions` exposes, paginated
 * with a sane default. Every filter is optional and AND-combined. Rows are
 * newest-first by purchase date, which is the ordering a "what did I spend
 * recently" or "show me these" question expects.
 */
export function listTransactions(db: LucaDb, filters: ListTransactionsFilters = {}): ListTransactionsResult {
  const limit = clamp(Math.trunc(filters.limit ?? DEFAULT_LIST_LIMIT), 1, MAX_LIST_LIMIT);
  const offset = Math.max(Math.trunc(filters.offset ?? 0), 0);

  const { clause, params } = buildWhere(filters);

  const totalRow = runQueryOne<{ count: number }>(db, `SELECT COUNT(*) as count FROM transactions ${clause}`, params);
  const totalCount = totalRow?.count ?? 0;

  const rows = runQuery<TransactionRow>(
    db,
    `
    SELECT
      id,
      transaction_date as date,
      merchant,
      description,
      city,
      amount,
      category_id as categoryId,
      (${EFFECTIVE_SECTION_SQL}) as section,
      installment_current as installmentCurrent,
      installment_total as installmentTotal,
      billing_month as billingMonth
    FROM transactions
    ${clause}
    ORDER BY transaction_date DESC, id
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { rows, totalCount, limit, offset, hasMore: offset + rows.length < totalCount };
}
