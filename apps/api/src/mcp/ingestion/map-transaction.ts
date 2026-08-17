import type { ParsedStatement, ParsedTransaction } from "../../parsers/statement-text-parser.js";

/**
 * The row shape inserted into the `transactions` table for a statement-
 * sourced transaction. Money stays an integer (Chilean pesos, no cents).
 * `categoryId` starts null out of this mapping function and is filled in
 * afterward by `planImport` applying stored categorization rules — this
 * function itself never touches the rules table.
 */
export interface NewTransactionRow {
  // Null until a categorization rule matches; see `applyRulesToRows` in
  // `rule-application.ts`, which `planImport` runs over every row before
  // it is persisted.
  categoryId: string | null;
  type: "expense";
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionDate: string;
  source: "statement";
  bank: string;
  referenceCode: string;
  billingMonth: string;
  section: ParsedTransaction["section"];
  isProjected: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

/** The statement's own billing cycle label, e.g. "2025-03". */
export function billingMonthFor(statement: ParsedStatement): string {
  return statement.statementDate.slice(0, 7);
}

/**
 * Splits the parser's "03/06" style installment string into its current
 * and total counts. A single-payment purchase still carries "01/01" from
 * the parser, so this always returns numbers rather than nulls for any row
 * that made it out of the parser.
 */
export function splitInstallment(installment: string | null): { current: number | null; total: number | null } {
  if (!installment) return { current: null, total: null };
  const [current, total] = installment.split("/").map((n) => parseInt(n, 10));
  return {
    current: Number.isNaN(current) ? null : current,
    total: Number.isNaN(total) ? null : total,
  };
}

/**
 * Maps one parsed transaction line onto a `transactions` insert row.
 *
 * `type` is always "expense". The schema's type enum (income / expense /
 * saving) has no category for a credit-card credit or refund, and a
 * statement's "payment" section rows (Pago Pesos TEF, abonos) already carry
 * a negative `amount` from the parser. Keeping them typed "expense" with a
 * signed amount means a plain SUM() over expense rows nets refunds against
 * charges correctly; re-typing them as "income" would misrepresent a credit
 * line adjustment as earnings. This is a deliberate modeling choice for the
 * ingestion layer — categorization (the next task) is free to refine it.
 *
 * The parser's `location` field (the city, e.g. "SANTIAGO") has no column
 * of its own on `transactions`, so it is carried in `description` rather
 * than discarded.
 *
 * `isProjected` is always false: the current parser does not yet emit
 * forward-projected future installment rows (the statement's "future
 * installments" section is intentionally skipped), so there is nothing to
 * mark projected today. The column stays wired for when that lands.
 */
export function mapTransactionRow(bank: string, statement: ParsedStatement, tx: ParsedTransaction): NewTransactionRow {
  const { current, total } = splitInstallment(tx.installment);
  return {
    categoryId: null,
    type: "expense",
    amount: tx.amount,
    merchant: tx.merchant || null,
    description: tx.location || null,
    transactionDate: tx.date,
    source: "statement",
    bank,
    referenceCode: tx.referenceCode,
    billingMonth: billingMonthFor(statement),
    section: tx.section,
    isProjected: false,
    installmentCurrent: current,
    installmentTotal: total,
  };
}
