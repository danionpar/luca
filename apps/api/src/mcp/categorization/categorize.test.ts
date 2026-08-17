import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "../queries/__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "../queries/__fixtures__/synthetic-seed.js";
import { categorize } from "./categorize.js";

test("assigns a category to specific transaction ids", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const txA = seedTransaction(db, { categoryId: null });
  const txB = seedTransaction(db, { categoryId: null });
  const untouched = seedTransaction(db, { categoryId: null });

  const result = categorize(db, [txA, txB], categoryId);

  assert.equal(result.requested, 2);
  assert.equal(result.updated, 2);

  const rows = db.$client.prepare("SELECT id, category_id as categoryId FROM transactions ORDER BY id").all() as {
    id: string;
    categoryId: string | null;
  }[];
  assert.equal(rows.find((r) => r.id === txA)?.categoryId, categoryId);
  assert.equal(rows.find((r) => r.id === txB)?.categoryId, categoryId);
  assert.equal(rows.find((r) => r.id === untouched)?.categoryId, null);
});

test("overwrites an existing category on the targeted ids", () => {
  const db = createTestDb();
  const oldCategory = seedCategory(db, { name: "Old" });
  const newCategory = seedCategory(db, { name: "New" });
  const txId = seedTransaction(db, { categoryId: oldCategory });

  const result = categorize(db, [txId], newCategory);

  assert.equal(result.updated, 1);
  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions WHERE id = ?").get(txId) as {
    categoryId: string;
  };
  assert.equal(row.categoryId, newCategory);
});

test("an empty id list touches nothing", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);

  const result = categorize(db, [], categoryId);

  assert.equal(result.requested, 0);
  assert.equal(result.updated, 0);
});
