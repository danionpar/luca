import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "../queries/__fixtures__/test-db.js";
import { seedCategory, seedRule, seedTransaction } from "../queries/__fixtures__/synthetic-seed.js";
import { createRule, creditRuleUsage, deleteRule, listRules } from "./rules.js";

test("creates a rule and lists it back", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);

  const { rule } = createRule(db, { merchantPattern: "lider", categoryId });

  assert.equal(rule.merchantPattern, "lider");
  assert.equal(rule.categoryId, categoryId);

  const rules = listRules(db);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, rule.id);
});

test("a freshly created rule starts at timesUsed 0 — it has categorized nothing yet", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);

  const { rule } = createRule(db, { merchantPattern: "lider", categoryId });

  assert.equal(rule.timesUsed, 0);
});

test("without applyToExisting, creating a rule never touches existing rows", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { merchant: "Lider", categoryId: null });

  const { applied } = createRule(db, { merchantPattern: "lider", categoryId });

  assert.equal(applied, undefined);
  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions").get() as { categoryId: string | null };
  assert.equal(row.categoryId, null);
});

test("applyToExisting categorizes currently-uncategorized matching rows immediately", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { merchant: "Lider", categoryId: null });

  const { rule, applied } = createRule(db, { merchantPattern: "lider", categoryId, applyToExisting: true });

  assert.equal(applied?.updated, 1);
  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions").get() as { categoryId: string };
  assert.equal(row.categoryId, categoryId);
  assert.equal(rule.timesUsed, 1, "timesUsed reflects the row applyToExisting actually touched");
});

test("applyToExisting sets timesUsed to exactly the number of rows it touched, across several matches", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  seedTransaction(db, { merchant: "Lider Uno", categoryId: null });
  seedTransaction(db, { merchant: "Lider Dos", categoryId: null });
  seedTransaction(db, { merchant: "Lider Tres", categoryId: null });

  const { rule, applied } = createRule(db, { merchantPattern: "lider", categoryId, applyToExisting: true });

  assert.equal(applied?.updated, 3);
  assert.equal(rule.timesUsed, 3);
});

test("applyToExisting never overwrites a transaction that already has a different category", () => {
  const db = createTestDb();
  const original = seedCategory(db, { name: "Original" });
  const target = seedCategory(db, { name: "Target" });
  seedTransaction(db, { merchant: "Lider", categoryId: original });

  const { rule, applied } = createRule(db, { merchantPattern: "lider", categoryId: target, applyToExisting: true });

  assert.equal(applied?.updated, 0);
  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions").get() as { categoryId: string };
  assert.equal(row.categoryId, original);
  assert.equal(rule.timesUsed, 0, "a rule that matched nothing stays at 0");
});

test("creditRuleUsage increments times_used by exactly the given count and bumps updated_at", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const ruleId = seedRule(db, { categoryId, merchantPattern: "lider", createdAtEpochSeconds: 1700000000 });

  creditRuleUsage(db, { [ruleId]: 5 });

  const row = db.$client.prepare("SELECT times_used as timesUsed, updated_at as updatedAt FROM categorization_rules WHERE id = ?").get(ruleId) as {
    timesUsed: number;
    updatedAt: number;
  };
  assert.equal(row.timesUsed, 5);
  assert.ok(row.updatedAt > 1700000000, "updated_at moved forward from the seeded creation time");
});

test("creditRuleUsage accumulates across separate calls instead of overwriting", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const ruleId = seedRule(db, { categoryId, merchantPattern: "lider" });

  creditRuleUsage(db, { [ruleId]: 2 });
  creditRuleUsage(db, { [ruleId]: 3 });

  const row = db.$client.prepare("SELECT times_used as timesUsed FROM categorization_rules WHERE id = ?").get(ruleId) as { timesUsed: number };
  assert.equal(row.timesUsed, 5);
});

test("creditRuleUsage never touches a rule that has no entry in the usage map", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const untouchedRuleId = seedRule(db, { categoryId, merchantPattern: "otra" });
  const creditedRuleId = seedRule(db, { categoryId, merchantPattern: "lider" });

  creditRuleUsage(db, { [creditedRuleId]: 4 });

  const untouched = db.$client.prepare("SELECT times_used as timesUsed FROM categorization_rules WHERE id = ?").get(untouchedRuleId) as {
    timesUsed: number;
  };
  assert.equal(untouched.timesUsed, 0);
});

test("deleteRule removes the rule and reports whether it existed", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const { rule } = createRule(db, { merchantPattern: "lider", categoryId });

  const result = deleteRule(db, rule.id);
  assert.equal(result.deleted, true);
  assert.equal(listRules(db).length, 0);

  const secondAttempt = deleteRule(db, rule.id);
  assert.equal(secondAttempt.deleted, false);
});

test("deleting a rule never uncategorizes transactions it previously categorized", () => {
  const db = createTestDb();
  const categoryId = seedCategory(db);
  const { rule } = createRule(db, { merchantPattern: "lider", categoryId, applyToExisting: true });
  const txId = seedTransaction(db, { merchant: "Lider Otro", categoryId: null });
  // Simulate that the rule had already categorized this row.
  db.$client.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(categoryId, txId);

  deleteRule(db, rule.id);

  const row = db.$client.prepare("SELECT category_id as categoryId FROM transactions WHERE id = ?").get(txId) as {
    categoryId: string;
  };
  assert.equal(row.categoryId, categoryId);
});
