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

test("parses installment purchases with their interest rate", () => {
  const result = parseStatementText(fixture);
  const installment = result.transactions.find((t) => t.referenceCode === "987654321098");

  assert.ok(installment, "expected the installment purchase to be parsed");
  assert.equal(installment.section, "installment");
  assert.equal(installment.interestRate, 2.45);
  assert.equal(installment.installment, "03/06");
  assert.equal(installment.amount, 20000);
});

test("parses charges and classifies negative amounts as payments", () => {
  const result = parseStatementText(fixture);

  const charge = result.transactions.find((t) => t.referenceCode === "111222333444");
  assert.ok(charge, "expected the commission charge to be parsed");
  assert.equal(charge.section, "charge");
  assert.equal(charge.amount, 5900);

  const credit = result.transactions.find((t) => t.referenceCode === "555666777888");
  assert.ok(credit, "expected the credit line to be parsed");
  assert.equal(credit.section, "payment");
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
