import { test } from "node:test";
import assert from "node:assert/strict";

import { billingMonthFor, mapTransactionRow, splitInstallment } from "./map-transaction.js";
import { makeBalancedStatement, makeTransaction } from "./__fixtures__/synthetic-statements.js";

test("billingMonthFor derives YYYY-MM from the statement's own statement date", () => {
  const statement = makeBalancedStatement({ statementDate: "2025-07-25" });
  assert.equal(billingMonthFor(statement), "2025-07");
});

test("splitInstallment parses a single-payment '01/01' marker", () => {
  assert.deepEqual(splitInstallment("01/01"), { current: 1, total: 1 });
});

test("splitInstallment parses a mid-plan installment marker", () => {
  assert.deepEqual(splitInstallment("03/06"), { current: 3, total: 6 });
});

test("splitInstallment returns nulls for a missing marker", () => {
  assert.deepEqual(splitInstallment(null), { current: null, total: null });
});

test("mapTransactionRow never introduces a float for money", () => {
  const statement = makeBalancedStatement();
  const tx = makeTransaction({ amount: 12345 });
  const row = mapTransactionRow("banco-chile", statement, tx);

  assert.equal(Number.isInteger(row.amount), true);
  assert.equal(row.amount, 12345);
});

test("mapTransactionRow leaves categoryId null and marks the source as a statement import", () => {
  const statement = makeBalancedStatement();
  const tx = makeTransaction();
  const row = mapTransactionRow("banco-chile", statement, tx);

  assert.equal(row.categoryId, null);
  assert.equal(row.source, "statement");
  assert.equal(row.bank, "banco-chile");
  assert.equal(row.isProjected, false);
});

test("mapTransactionRow carries the reference code through for later dedup", () => {
  const statement = makeBalancedStatement();
  const tx = makeTransaction({ referenceCode: "555555555555" });
  const row = mapTransactionRow("banco-chile", statement, tx);

  assert.equal(row.referenceCode, "555555555555");
});

test("mapTransactionRow carries the parser's own section classification through unchanged", () => {
  const statement = makeBalancedStatement();
  const tx = makeTransaction({ section: "installment" });
  const row = mapTransactionRow("banco-chile", statement, tx);

  assert.equal(row.section, "installment");
});

test("mapTransactionRow stores the parser's city in city and leaves description for the owner's notes", () => {
  const statement = makeBalancedStatement();
  const tx = makeTransaction({ location: "PROVIDENCIA" });
  const row = mapTransactionRow("banco-chile", statement, tx);

  assert.equal(row.city, "PROVIDENCIA");
  assert.equal(row.description, null);
});
