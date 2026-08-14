import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseStatementText } from "./statement-text-parser.js";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "synthetic-statement.txt"),
  "utf-8",
);

test("reads the statement header", () => {
  const result = parseStatementText(fixture);

  assert.equal(result.cardLastFour, "4321");
  assert.equal(result.statementDate, "2025-03-25");
  assert.equal(result.periodFrom, "2025-03-01");
  assert.equal(result.periodTo, "2025-03-31");
  assert.equal(result.totalBilled, 250000);
});

test("parses single-payment purchases", () => {
  const result = parseStatementText(fixture);
  const single = result.transactions.find((t) => t.referenceCode === "123456789012");

  assert.ok(single, "expected the first purchase to be parsed");
  assert.equal(single.date, "2025-03-15");
  assert.equal(single.merchant, "TIENDA EJEMPLO UNO");
  assert.equal(single.location, "SANTIAGO");
  assert.equal(single.amount, 45990);
  assert.equal(single.section, "single");
  assert.equal(single.interestRate, null);
});

test("parses PAT (Pago Automático de Cuentas) rows into their own section, not 'single'", () => {
  const result = parseStatementText(fixture);
  const patRows = result.transactions.filter((t) => t.section === "pat");

  assert.equal(patRows.length, 2, "expected both PAT rows to be parsed");
  assert.ok(
    patRows.every((t) => ["222333444555", "222333444556"].includes(t.referenceCode)),
    "expected the PAT rows to be the ones between TOTAL PAGOS and TOTAL PAT A LA CUENTA",
  );

  const singleRefCodes = result.transactions.filter((t) => t.section === "single").map((t) => t.referenceCode);
  assert.ok(
    !singleRefCodes.includes("222333444555") && !singleRefCodes.includes("222333444556"),
    "PAT rows must not be counted as single purchases",
  );
});

test("parses installment purchases with their interest rate", () => {
  const result = parseStatementText(fixture);
  const installment = result.transactions.find((t) => t.referenceCode === "987654321098");

  assert.ok(installment, "expected the installment purchase to be parsed");
  assert.equal(installment.section, "installment");
  assert.equal(installment.interestRate, 2.45);
  assert.equal(installment.installment, "03/06");
  assert.equal(installment.amount, 20000);
});

test("parses a payment row into the payment section", () => {
  const result = parseStatementText(fixture);

  const payment = result.transactions.find((t) => t.referenceCode === "700000000001");
  assert.ok(payment, "expected the payment row to be parsed");
  assert.equal(payment.section, "payment");
  assert.equal(payment.amount, -30000);
});

test("classifies charges region rows by region, not by the sign of their amount", () => {
  const result = parseStatementText(fixture);

  const charge = result.transactions.find((t) => t.referenceCode === "111222333444");
  assert.ok(charge, "expected the commission charge to be parsed");
  assert.equal(charge.section, "charge");
  assert.equal(charge.amount, 5900);

  // A negative row inside the charges region (a refund/credit adjustment) is
  // still a "charge" — only the payments region ever yields "payment".
  // Reclassifying it by sign alone was the original defect: it double-counted
  // refunds as card payments regardless of which region they actually came from.
  const credit = result.transactions.find((t) => t.referenceCode === "555666777888");
  assert.ok(credit, "expected the credit line to be parsed");
  assert.equal(credit.section, "charge");
  assert.equal(credit.amount, -30000);
});

test("falls back to a merged merchant/city capture when only one space separates them", () => {
  const result = parseStatementText(fixture);
  const merged = result.transactions.find((t) => t.referenceCode === "123456789014");

  assert.ok(merged, "expected the single-space row to still be captured rather than dropped");
  assert.equal(merged.date, "2025-03-17");
  assert.equal(merged.amount, 8000);
  assert.equal(merged.section, "single");
  assert.match(
    merged.merchant,
    /TIENDA EJEMPLO CUATRO/,
    "expected the merged field to still contain the merchant words",
  );
  assert.match(
    merged.merchant,
    /VALPARAISO/,
    "expected the merged field to also contain the city, since the boundary between them was unrecoverable",
  );
});

test("stops at the international statement section", () => {
  const result = parseStatementText(fixture);

  assert.equal(
    result.transactions.find((t) => t.referenceCode === "999888777666"),
    undefined,
    "transactions after the international marker must be ignored",
  );
});

test("ignores transaction lines that appear before any section marker", () => {
  const result = parseStatementText(
    "SANTIAGO 15/03/25 123456789012 TIENDA  SANTIAGO $ 1.000 $ 1.000 01/01 $ 1.000",
  );

  assert.equal(
    result.transactions.length,
    0,
    "the parser starts in the 'pre' section and must ignore rows until a section begins",
  );
});

test("expands two-digit years into the 2000s", () => {
  const result = parseStatementText(fixture);
  const dates = result.transactions.map((t) => t.date);

  assert.ok(dates.length > 0, "expected the fixture to yield transactions");
  for (const date of dates) {
    assert.match(date, /^20\d{2}-\d{2}-\d{2}$/, `expected an ISO date in the 2000s, got ${date}`);
  }
});

test("reconciliation balances for a statement whose printed totals match its rows", () => {
  const result = parseStatementText(fixture);

  assert.equal(
    result.reconciliation.balanced,
    true,
    `expected the fixture to reconcile, got checks: ${JSON.stringify(result.reconciliation.checks)}`,
  );
  for (const check of result.reconciliation.checks) {
    assert.equal(check.balances, true, `expected the ${check.section} check to balance`);
    assert.equal(check.delta, 0);
  }
});

test("the single-section sum matches the fixture's printed TOTAL TRANSACCIONES EN UNA CUOTA", () => {
  const result = parseStatementText(fixture);
  const singleCheck = result.reconciliation.checks.find((c) => c.section === "single");

  assert.ok(singleCheck, "expected a 'single' reconciliation check");
  assert.equal(singleCheck.printedTotal, 66490);
  assert.equal(singleCheck.parsedSum, 66490);
});

test("the pat-section sum matches the fixture's printed TOTAL PAT A LA CUENTA", () => {
  const result = parseStatementText(fixture);
  const patCheck = result.reconciliation.checks.find((c) => c.section === "pat");

  assert.ok(patCheck, "expected a 'pat' reconciliation check");
  assert.equal(patCheck.printedTotal, 37000);
  assert.equal(patCheck.parsedSum, 37000);
});

test("a statement with no PAT region still parses and reconciles", () => {
  const noPatStatement = [
    "Pago Pesos TEF",
    "05/03/25 900000000001 PAGO EJEMPLO $ -5.000 $ -5.000 01/01 $ -5.000",
    "TOTAL PAGOS $ -5.000",
    "SANTIAGO 15/03/25 900000000002 TIENDA EJEMPLO SEIS  SANTIAGO $ 9.000 $ 9.000 01/01 $ 9.000",
    "TOTAL TRANSACCIONES EN UNA CUOTA $ 9.000",
  ].join("\n");

  const result = parseStatementText(noPatStatement);
  const single = result.transactions.find((t) => t.referenceCode === "900000000002");

  assert.ok(single, "expected the single purchase to be parsed even without a PAT marker");
  assert.equal(
    single.section,
    "single",
    "a row must not stay mistagged 'pat' when TOTAL PAT A LA CUENTA never printed",
  );

  const singleCheck = result.reconciliation.checks.find((c) => c.section === "single");
  assert.ok(singleCheck);
  assert.equal(singleCheck.balances, true);
  assert.equal(
    result.reconciliation.balanced,
    true,
    "a missing PAT marker must not prevent the rest of the statement from reconciling",
  );
});

test("a negative amount in the singles region stays 'single', not 'payment'", () => {
  const statement = [
    "1.TOTAL OPERACIONES",
    "Pago Pesos TEF",
    "TOTAL PAGOS $ 0",
    "TOTAL PAT A LA CUENTA $ 0",
    "SANTIAGO 15/03/25 900000000030 TIENDA EJEMPLO OCHO  SANTIAGO $ -4.000 $ -4.000 01/01 $ -4.000",
    "TOTAL TRANSACCIONES EN UNA CUOTA $ -4.000",
  ].join("\n");

  const result = parseStatementText(statement);
  const row = result.transactions.find((t) => t.referenceCode === "900000000030");

  assert.ok(row, "expected the negative-amount single row to be parsed");
  assert.equal(row.section, "single", "a negative amount must not reclassify a single-purchase row as a payment");
  assert.equal(row.amount, -4000);
});

test("'1.TOTAL OPERACIONES' alone starts the payments region, even when no row describes itself as 'Pago Pesos TEF'", () => {
  // Regression test: some statements label their payment rows with a
  // different description (e.g. a generic "paid amount" caption) instead of
  // the electronic-transfer text. The payments/PAT region must still be
  // entered from the statement's own section header, or those rows — and any
  // PAT rows behind them — are silently dropped instead of parsed.
  const statement = [
    "1.TOTAL OPERACIONES",
    "05/03/25 900000000040 MONTO CANCELADO $ -5.000 $ -5.000 01/01 $ -5.000",
    "TOTAL PAGOS $ -5.000",
    "TOTAL PAT A LA CUENTA $ 0",
    "TOTAL TRANSACCIONES EN UNA CUOTA $ 0",
  ].join("\n");

  const result = parseStatementText(statement);
  const payment = result.transactions.find((t) => t.referenceCode === "900000000040");

  assert.ok(payment, "expected the payment row to be parsed even without a 'Pago Pesos TEF' description");
  assert.equal(payment.section, "payment");
  assert.equal(payment.amount, -5000);

  const paymentCheck = result.reconciliation.checks.find((c) => c.section === "payment");
  assert.ok(paymentCheck);
  assert.equal(paymentCheck.balances, true);
});

test("a missing printed total is reported as absent, never as balanced", () => {
  const noPatStatement = [
    "Pago Pesos TEF",
    "TOTAL PAGOS $ -5.000",
    "SANTIAGO 15/03/25 900000000003 TIENDA EJEMPLO SIETE  SANTIAGO $ 9.000 $ 9.000 01/01 $ 9.000",
    "TOTAL TRANSACCIONES EN UNA CUOTA $ 9.000",
  ].join("\n");

  const result = parseStatementText(noPatStatement);
  const patCheck = result.reconciliation.checks.find((c) => c.section === "pat");

  assert.ok(patCheck, "expected a 'pat' check even though the statement never prints that total");
  assert.equal(patCheck.printedTotal, null);
  assert.equal(patCheck.delta, null);
  assert.equal(
    patCheck.balances,
    false,
    "an absent printed total must never be reported as balancing",
  );
});
