import { test } from "node:test";
import assert from "node:assert/strict";

import { planImport, sortStatementsChronologically } from "./plan.js";
import { makeBalancedStatement, makeTransaction, makeUnbalancedStatement } from "./__fixtures__/synthetic-statements.js";
import type { DiscoveredStatement } from "./types.js";

function noPriorImports() {
  return {
    bank: "banco-chile",
    isStatementAlreadyImported: () => false,
    isTransactionAlreadyImported: () => false,
  };
}

test("refuses a statement that does not reconcile against its own printed totals", () => {
  const statement = makeUnbalancedStatement();
  const [result] = planImport([{ filePath: "/inbox/a.pdf", statement }], noPriorImports());

  assert.equal(result.decision.kind, "refuse_reconciliation");
  if (result.decision.kind === "refuse_reconciliation") {
    assert.ok(result.decision.checks.some((c) => !c.balances && c.printedTotal !== null));
  }
});

test("imports a statement that reconciles", () => {
  const statement = makeBalancedStatement();
  const [result] = planImport([{ filePath: "/inbox/a.pdf", statement }], noPriorImports());

  assert.equal(result.decision.kind, "import");
  if (result.decision.kind === "import") {
    assert.equal(result.decision.rows.length, statement.transactions.length);
    assert.equal(result.decision.duplicateTransactions, 0);
  }
});

test("skips a statement already imported in a previous run (by bank + card + period)", () => {
  const statement = makeBalancedStatement();
  const ctx = {
    bank: "banco-chile",
    isStatementAlreadyImported: () => true,
    isTransactionAlreadyImported: () => false,
  };

  const [result] = planImport([{ filePath: "/inbox/a.pdf", statement }], ctx);

  assert.equal(result.decision.kind, "skip_duplicate");
});

test("skips the same statement a second time within one run, without re-checking the database", () => {
  const statement = makeBalancedStatement();
  let dbCalls = 0;
  const ctx = {
    bank: "banco-chile",
    isStatementAlreadyImported: () => {
      dbCalls++;
      return false;
    },
    isTransactionAlreadyImported: () => false,
  };

  const discovered: DiscoveredStatement[] = [
    { filePath: "/inbox/a.pdf", statement },
    { filePath: "/inbox/a-copy.pdf", statement },
  ];

  const [first, second] = planImport(discovered, ctx);

  assert.equal(first.decision.kind, "import");
  assert.equal(second.decision.kind, "skip_duplicate");
  // The DB is asked about the first occurrence only; the in-batch duplicate
  // is caught by the "seen this run" set before it ever calls out.
  assert.equal(dbCalls, 1);
});

test("drops an individual transaction already imported previously, without refusing the rest of the statement", () => {
  const duplicateTx = makeTransaction({ referenceCode: "999999999999" });
  const newTx = makeTransaction({ referenceCode: "888888888888" });
  const statement = makeBalancedStatement({ transactions: [duplicateTx, newTx] });

  const ctx = {
    bank: "banco-chile",
    isStatementAlreadyImported: () => false,
    isTransactionAlreadyImported: (referenceCode: string) => referenceCode === "999999999999",
  };

  const [result] = planImport([{ filePath: "/inbox/a.pdf", statement }], ctx);

  assert.equal(result.decision.kind, "import");
  if (result.decision.kind === "import") {
    assert.equal(result.decision.duplicateTransactions, 1);
    assert.equal(result.decision.rows.length, 1);
    assert.equal(result.decision.rows[0].referenceCode, "888888888888");
  }
});

test("deduplicates a transaction that repeats within the same run, across two different statements", () => {
  const sharedRefCode = "777777777777";
  const first = makeBalancedStatement({
    statementDate: "2025-02-25",
    periodFrom: "2025-02-01",
    periodTo: "2025-02-28",
    transactions: [makeTransaction({ referenceCode: sharedRefCode })],
  });
  const second = makeBalancedStatement({
    statementDate: "2025-03-25",
    periodFrom: "2025-03-01",
    periodTo: "2025-03-31",
    transactions: [makeTransaction({ referenceCode: sharedRefCode })],
  });

  const results = planImport(
    [
      { filePath: "/inbox/feb.pdf", statement: first },
      { filePath: "/inbox/mar.pdf", statement: second },
    ],
    noPriorImports(),
  );

  const [febResult, marResult] = results;
  assert.equal(febResult.decision.kind, "import");
  assert.equal(marResult.decision.kind, "import");
  if (febResult.decision.kind === "import" && marResult.decision.kind === "import") {
    assert.equal(febResult.decision.rows.length, 1, "the first statement to run keeps the transaction");
    assert.equal(marResult.decision.rows.length, 0, "the later statement sees it as already imported this run");
    assert.equal(marResult.decision.duplicateTransactions, 1);
  }
});

test("sorts statements oldest-first by the statement date read from the PDF, ignoring file order", () => {
  const march = makeBalancedStatement({ statementDate: "2025-03-25", periodFrom: "2025-03-01", periodTo: "2025-03-31" });
  const january = makeBalancedStatement({ statementDate: "2025-01-25", periodFrom: "2025-01-01", periodTo: "2025-01-31" });
  const february = makeBalancedStatement({ statementDate: "2025-02-25", periodFrom: "2025-02-01", periodTo: "2025-02-28" });

  const ordered = sortStatementsChronologically([
    { filePath: "/inbox/march.pdf", statement: march },
    { filePath: "/inbox/january.pdf", statement: january },
    { filePath: "/inbox/february.pdf", statement: february },
  ]);

  assert.deepEqual(
    ordered.map((d) => d.statement.statementDate),
    ["2025-01-25", "2025-02-25", "2025-03-25"],
  );
});

test("planImport itself processes (and reports) statements in chronological order regardless of input order", () => {
  const march = makeBalancedStatement({ statementDate: "2025-03-25", periodFrom: "2025-03-01", periodTo: "2025-03-31" });
  const january = makeBalancedStatement({ statementDate: "2025-01-25", periodFrom: "2025-01-01", periodTo: "2025-01-31" });

  const results = planImport(
    [
      { filePath: "/inbox/march.pdf", statement: march },
      { filePath: "/inbox/january.pdf", statement: january },
    ],
    noPriorImports(),
  );

  assert.deepEqual(results.map((r) => r.statementDate), ["2025-01-25", "2025-03-25"]);
});
