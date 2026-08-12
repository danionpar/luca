import type { ParsedStatement, ParsedTransaction, ReconciliationResult } from "../../../parsers/statement-text-parser.js";

// Fully synthetic statement data for ingestion tests. No real statement,
// merchant, card number, or amount ever appears here — this repository is
// public.

export function makeTransaction(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: "2025-03-15",
    referenceCode: "100000000001",
    merchant: "TIENDA EJEMPLO",
    location: "SANTIAGO",
    amount: 10000,
    installment: "01/01",
    interestRate: null,
    section: "single",
    ...overrides,
  };
}

/**
 * A statement that reconciles: its `single` section total matches the sum
 * of the transactions tagged "single", and every other section is absent
 * (printedTotal null, which the parser's own rule treats as vacuously
 * balanced).
 */
export function makeBalancedStatement(overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  const transactions = overrides.transactions ?? [makeTransaction()];
  const singleSum = transactions.filter((t) => t.section === "single").reduce((sum, t) => sum + t.amount, 0);

  const reconciliation: ReconciliationResult = overrides.reconciliation ?? {
    balanced: true,
    checks: [
      { section: "payment", parsedSum: 0, printedTotal: null, delta: null, balances: false },
      { section: "pat", parsedSum: 0, printedTotal: null, delta: null, balances: false },
      { section: "single", parsedSum: singleSum, printedTotal: singleSum, delta: 0, balances: true },
      { section: "installment", parsedSum: 0, printedTotal: null, delta: null, balances: false },
    ],
  };

  return {
    cardLastFour: "4321",
    statementDate: "2025-03-25",
    periodFrom: "2025-03-01",
    periodTo: "2025-03-31",
    totalBilled: singleSum,
    transactions,
    reconciliation,
    ...overrides,
  };
}

/** A statement whose printed "single" total does not match the parsed sum. */
export function makeUnbalancedStatement(overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  const base = makeBalancedStatement(overrides);
  const singleCheck = base.reconciliation.checks.find((c) => c.section === "single");
  const printedTotal = (singleCheck?.parsedSum ?? 0) + 5000;

  return {
    ...base,
    reconciliation: {
      balanced: false,
      checks: base.reconciliation.checks.map((c) =>
        c.section === "single" ? { ...c, printedTotal, delta: c.parsedSum - printedTotal, balances: false } : c,
      ),
    },
  };
}
