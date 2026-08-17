import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "../queries/__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "../queries/__fixtures__/synthetic-seed.js";
import { bulkCategorize } from "./bulk-categorize.js";

test("assigns a category to every transaction whose merchant matches, case-insensitively", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { merchant: "Supermercado Lider" });
  seedTransaction(db, { merchant: "LIDER EXPRESS" });
  seedTransaction(db, { merchant: "Something Else" });

  const result = bulkCategorize(db, { merchantPattern: "lider", categoryId });

  assert.equal(result.matched, 2);
  assert.equal(result.updated, 2);

  const untouched = db.$client
    .prepare("SELECT category_id as categoryId FROM transactions WHERE merchant = ?")
    .get("Something Else") as { categoryId: string | null };
  assert.equal(untouched.categoryId, null);
});

test("a dry run reports the match count and writes nothing", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { merchant: "Supermercado Lider" });

  const result = bulkCategorize(db, { merchantPattern: "lider", categoryId, dryRun: true });

  assert.equal(result.matched, 1);
  assert.equal(result.updated, 0);

  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions").get() as { categoryId: string | null };
  assert.equal(row.categoryId, null);
});

test("onlyUncategorized leaves an already-categorized matching row untouched", () => {
  const db = createTestDb();
  const original = seedCategory(db, { name: "Original" });
  const target = seedCategory(db, { name: "Target" });
  seedTransaction(db, { merchant: "Lider", categoryId: original });
  seedTransaction(db, { merchant: "Lider", categoryId: null });

  const result = bulkCategorize(db, { merchantPattern: "lider", categoryId: target, onlyUncategorized: true });

  assert.equal(result.matched, 1);
  assert.equal(result.updated, 1);

  const rows = db.$client.prepare("SELECT category_id as categoryId FROM transactions ORDER BY category_id").all() as {
    categoryId: string | null;
  }[];
  assert.ok(rows.some((r) => r.categoryId === original), "the pre-categorized row must be untouched");
  assert.ok(rows.some((r) => r.categoryId === target), "the previously-uncategorized row must now be targeted");
});
