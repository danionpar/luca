import { test } from "node:test";
import assert from "node:assert/strict";

import { categories } from "../../db/schema.js";
import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory } from "./__fixtures__/synthetic-seed.js";
import { listCategories } from "./list-categories.js";

test("lists active categories ordered by type then sort order", () => {
  const db = createTestDb();
  seedCategory(db, { name: "Groceries", type: "expense" });
  seedCategory(db, { name: "Salary", type: "income" });

  const result = listCategories(db);

  assert.equal(result.length, 2);
  assert.ok(result.every((c) => c.isActive === true));
});

test("excludes inactive categories by default, and includes them when asked", () => {
  const db = createTestDb();
  const activeId = seedCategory(db, { name: "Active" });
  db.insert(categories).values({ id: "inactive-1", name: "Retired", emoji: "🗑️", type: "expense", isActive: false }).run();

  const activeOnly = listCategories(db);
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].id, activeId);

  const all = listCategories(db, true);
  assert.equal(all.length, 2);
});
