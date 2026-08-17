import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { listUncategorized } from "./list-uncategorized.js";

test("groups uncategorized transactions by merchant, biggest total first", () => {
  const db = createTestDb();
  seedTransaction(db, { merchant: "MERCHANT A", amount: 1000, categoryId: null });
  seedTransaction(db, { merchant: "MERCHANT A", amount: 2000, categoryId: null });
  seedTransaction(db, { merchant: "MERCHANT B", amount: 10_000, categoryId: null });

  const result = listUncategorized(db);

  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].merchant, "MERCHANT B");
  assert.equal(result.groups[0].total, 10_000);
  assert.equal(result.groups[0].count, 1);
  assert.equal(result.groups[1].merchant, "MERCHANT A");
  assert.equal(result.groups[1].total, 3000);
  assert.equal(result.groups[1].count, 2);
});

test("excludes already-categorized transactions entirely", () => {
  const db = createTestDb();
  const cat = seedCategory(db);
  seedTransaction(db, { merchant: "CATEGORIZED MERCHANT", categoryId: cat });
  seedTransaction(db, { merchant: "UNCATEGORIZED MERCHANT", categoryId: null });

  const result = listUncategorized(db);

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].merchant, "UNCATEGORIZED MERCHANT");
});

test("groups a null merchant under a visible placeholder instead of disappearing", () => {
  const db = createTestDb();
  seedTransaction(db, { merchant: null, categoryId: null, amount: 1500 });

  const result = listUncategorized(db);

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].merchant, "(no merchant)");
});

test("reports totals across ALL uncategorized rows, independent of pagination", () => {
  const db = createTestDb();
  for (let i = 0; i < 3; i++) {
    seedTransaction(db, { merchant: `MERCHANT ${i}`, amount: 1000, categoryId: null });
  }

  const page = listUncategorized(db, { limit: 1 });

  assert.equal(page.groups.length, 1);
  assert.equal(page.totalMerchantGroups, 3);
  assert.equal(page.totalTransactions, 3);
  assert.equal(page.totalAmount, 3000);
  assert.equal(page.hasMore, true);
});
