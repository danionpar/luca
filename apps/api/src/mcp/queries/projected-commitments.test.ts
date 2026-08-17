import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { projectedCommitments } from "./projected-commitments.js";

test("projects the remaining installments of an open plan forward from its most recent billed occurrence", () => {
  const db = createTestDb();
  // A 6-installment plan, billed for the 3rd time so far (3 more owed).
  seedTransaction(db, {
    merchant: "SERVICE X",
    transactionDate: "2025-01-15",
    amount: 1000,
    installmentTotal: 6,
    installmentCurrent: 1,
    billingMonth: "2025-01",
    section: "installment",
  });
  seedTransaction(db, {
    merchant: "SERVICE X",
    transactionDate: "2025-01-15",
    amount: 1000,
    installmentTotal: 6,
    installmentCurrent: 2,
    billingMonth: "2025-02",
    section: "installment",
  });
  seedTransaction(db, {
    merchant: "SERVICE X",
    transactionDate: "2025-01-15",
    amount: 1000,
    installmentTotal: 6,
    installmentCurrent: 3,
    billingMonth: "2025-03",
    section: "installment",
  });

  const result = projectedCommitments(db);

  assert.equal(result.openInstallmentPlans, 1);
  assert.equal(result.totalRemaining, 3000);
  assert.deepEqual(
    result.months.map((m) => ({ billingMonth: m.billingMonth, total: m.total, count: m.count })),
    [
      { billingMonth: "2025-04", total: 1000, count: 1 },
      { billingMonth: "2025-05", total: 1000, count: 1 },
      { billingMonth: "2025-06", total: 1000, count: 1 },
    ],
  );
});

test("a fully paid-off installment plan contributes nothing", () => {
  const db = createTestDb();
  seedTransaction(db, {
    merchant: "PAID OFF",
    transactionDate: "2024-01-01",
    amount: 500,
    installmentTotal: 3,
    installmentCurrent: 3,
    billingMonth: "2024-03",
  });

  const result = projectedCommitments(db);

  assert.equal(result.openInstallmentPlans, 0);
  assert.equal(result.totalRemaining, 0);
  assert.deepEqual(result.months, []);
});

test("a single-payment (non-installment) transaction is never projected", () => {
  const db = createTestDb();
  seedTransaction(db, { installmentTotal: 1, installmentCurrent: 1 });

  const result = projectedCommitments(db);

  assert.equal(result.openInstallmentPlans, 0);
});

test("per-installment detail is only included when includeDetail is requested", () => {
  const db = createTestDb();
  seedTransaction(db, {
    merchant: "SERVICE Y",
    transactionDate: "2025-01-15",
    amount: 2000,
    installmentTotal: 2,
    installmentCurrent: 1,
    billingMonth: "2025-01",
  });

  const withoutDetail = projectedCommitments(db);
  assert.equal(withoutDetail.details, undefined);

  const withDetail = projectedCommitments(db, { includeDetail: true });
  assert.equal(withDetail.details?.length, 1);
  assert.equal(withDetail.details?.[0].projectedBillingMonth, "2025-02");
  assert.equal(withDetail.details?.[0].installmentNumber, 1);
  assert.equal(withDetail.details?.[0].installmentTotal, 2);
});

test("two independent open plans in the same future month are summed together", () => {
  const db = createTestDb();
  seedTransaction(db, {
    merchant: "PLAN A",
    transactionDate: "2025-01-01",
    amount: 1000,
    installmentTotal: 2,
    installmentCurrent: 1,
    billingMonth: "2025-03",
  });
  seedTransaction(db, {
    merchant: "PLAN B",
    transactionDate: "2025-02-01",
    amount: 2500,
    installmentTotal: 2,
    installmentCurrent: 1,
    billingMonth: "2025-03",
  });

  const result = projectedCommitments(db);

  assert.equal(result.months.length, 1);
  assert.equal(result.months[0].billingMonth, "2025-04");
  assert.equal(result.months[0].total, 3500);
  assert.equal(result.months[0].count, 2);
});
