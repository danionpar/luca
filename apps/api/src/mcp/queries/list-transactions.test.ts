import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { listTransactions } from "./list-transactions.js";

test("returns rows newest-first with a total count", () => {
  const db = createTestDb();
  seedTransaction(db, { transactionDate: "2025-03-01", billingMonth: "2025-03" });
  seedTransaction(db, { transactionDate: "2025-03-15", billingMonth: "2025-03" });

  const result = listTransactions(db);

  assert.equal(result.totalCount, 2);
  assert.deepEqual(
    result.rows.map((r) => r.date),
    ["2025-03-15", "2025-03-01"],
  );
});

test("filters by billing month (statement cycle), independent of the purchase date", () => {
  const db = createTestDb();
  seedTransaction(db, { transactionDate: "2024-04-12", billingMonth: "2025-11" });
  seedTransaction(db, { transactionDate: "2025-06-01", billingMonth: "2025-06" });

  const result = listTransactions(db, { billingMonth: "2025-11" });

  assert.equal(result.totalCount, 1);
  assert.equal(result.rows[0].date, "2024-04-12");
});

test("filters by purchase-date range", () => {
  const db = createTestDb();
  seedTransaction(db, { transactionDate: "2025-01-10" });
  seedTransaction(db, { transactionDate: "2025-02-10" });
  seedTransaction(db, { transactionDate: "2025-03-10" });

  const result = listTransactions(db, { dateFrom: "2025-02-01", dateTo: "2025-02-28" });

  assert.equal(result.totalCount, 1);
  assert.equal(result.rows[0].date, "2025-02-10");
});

test("filters by category", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { categoryId });
  seedTransaction(db, { categoryId: null });

  const result = listTransactions(db, { categoryId });

  assert.equal(result.totalCount, 1);
});

test("filters uncategorizedOnly", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { categoryId });
  seedTransaction(db, { categoryId: null });

  const result = listTransactions(db, { uncategorizedOnly: true });

  assert.equal(result.totalCount, 1);
  assert.equal(result.rows[0].categoryId, null);
});

test("merchant substring filter is case-insensitive and escapes LIKE wildcards literally", () => {
  const db = createTestDb();
  seedTransaction(db, { merchant: "Tienda 100% Fresh" });
  seedTransaction(db, { merchant: "Something Else" });

  const result = listTransactions(db, { merchantContains: "100%" });

  assert.equal(result.totalCount, 1);
  assert.equal(result.rows[0].merchant, "Tienda 100% Fresh");
});

test("section filter matches the exact persisted section for new-style rows", () => {
  const db = createTestDb();
  seedTransaction(db, { section: "single", installmentTotal: 1, installmentCurrent: 1 });
  seedTransaction(db, { section: "payment", installmentTotal: 1, installmentCurrent: 1, amount: -5000 });

  const result = listTransactions(db, { section: "payment" });

  assert.equal(result.totalCount, 1);
  assert.equal(result.rows[0].section, "payment");
});

test("section filter recognizes 'installment' for legacy rows with no persisted section but installment_total > 1", () => {
  const db = createTestDb();
  seedTransaction(db, { section: null, installmentTotal: 6, installmentCurrent: 3 });

  const result = listTransactions(db, { section: "installment" });

  assert.equal(result.totalCount, 1);
});

test("section filter buckets a legacy row with no installment plan as legacy_unclassified", () => {
  const db = createTestDb();
  seedTransaction(db, { section: null, installmentTotal: 1, installmentCurrent: 1 });

  const result = listTransactions(db, { section: "legacy_unclassified" });

  assert.equal(result.totalCount, 1);
});

test("paginates with limit and offset, and reports hasMore correctly", () => {
  const db = createTestDb();
  for (let i = 0; i < 5; i++) {
    seedTransaction(db, { transactionDate: `2025-03-0${i + 1}` });
  }

  const page1 = listTransactions(db, { limit: 2, offset: 0 });
  const page2 = listTransactions(db, { limit: 2, offset: 4 });

  assert.equal(page1.rows.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page2.rows.length, 1);
  assert.equal(page2.hasMore, false);
});

test("clamps an out-of-range limit to the maximum", () => {
  const db = createTestDb();
  seedTransaction(db);

  const result = listTransactions(db, { limit: 10_000 });

  assert.ok(result.limit <= 200);
});
