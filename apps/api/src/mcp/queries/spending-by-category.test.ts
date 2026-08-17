import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { spendingByCategory } from "./spending-by-category.js";

test("totals and counts per category, biggest absolute total first", () => {
  const db = createTestDb();
  const groceries = seedCategory(db, { name: "Groceries", emoji: "🛒" });
  const transport = seedCategory(db, { name: "Transport", emoji: "🚗" });

  seedTransaction(db, { categoryId: groceries, amount: 10_000 });
  seedTransaction(db, { categoryId: groceries, amount: 5_000 });
  seedTransaction(db, { categoryId: transport, amount: 30_000 });

  const result = spendingByCategory(db);

  assert.equal(result.length, 2);
  assert.equal(result[0].categoryName, "Transport");
  assert.equal(result[0].total, 30_000);
  assert.equal(result[1].categoryName, "Groceries");
  assert.equal(result[1].total, 15_000);
  assert.equal(result[1].count, 2);
});

test("uncategorized transactions get their own explicit bucket rather than being dropped", () => {
  const db = createTestDb();
  const groceries = seedCategory(db, { name: "Groceries" });
  seedTransaction(db, { categoryId: groceries, amount: 1000 });
  seedTransaction(db, { categoryId: null, amount: 500 });
  seedTransaction(db, { categoryId: null, amount: 700 });

  const result = spendingByCategory(db);

  const uncategorized = result.find((r) => r.categoryId === null);
  assert.ok(uncategorized, "uncategorized bucket must be present");
  assert.equal(uncategorized?.categoryName, "Uncategorized");
  assert.equal(uncategorized?.total, 1200);
  assert.equal(uncategorized?.count, 2);
});

test("filters by billing month", () => {
  const db = createTestDb();
  const cat = seedCategory(db);
  seedTransaction(db, { categoryId: cat, billingMonth: "2025-03", amount: 1000 });
  seedTransaction(db, { categoryId: cat, billingMonth: "2025-04", amount: 5000 });

  const result = spendingByCategory(db, { billingMonth: "2025-04" });

  assert.equal(result.length, 1);
  assert.equal(result[0].total, 5000);
});

test("filters by a purchase-date range", () => {
  const db = createTestDb();
  const cat = seedCategory(db);
  seedTransaction(db, { categoryId: cat, transactionDate: "2025-01-05", amount: 1000 });
  seedTransaction(db, { categoryId: cat, transactionDate: "2025-06-05", amount: 5000 });

  const result = spendingByCategory(db, { dateFrom: "2025-01-01", dateTo: "2025-01-31" });

  assert.equal(result.length, 1);
  assert.equal(result[0].total, 1000);
});
