import { test } from "node:test";
import assert from "node:assert/strict";

import { applyRulesToRows } from "./rule-application.js";
import type { MatchableRule } from "../categorization/rule-matching.js";
import type { NewTransactionRow } from "./map-transaction.js";

function row(overrides: Partial<NewTransactionRow> = {}): NewTransactionRow {
  return {
    categoryId: null,
    type: "expense",
    amount: 1000,
    merchant: "SAMPLE MERCHANT",
    description: null,
    city: null,
    transactionDate: "2025-03-15",
    source: "statement",
    bank: "banco-chile",
    referenceCode: "ref-1",
    billingMonth: "2025-03",
    section: "single",
    isProjected: false,
    installmentCurrent: 1,
    installmentTotal: 1,
    ...overrides,
  };
}

function rule(overrides: Partial<MatchableRule>): MatchableRule {
  return {
    id: "rule-1",
    categoryId: "cat-1",
    merchantPattern: "SAMPLE",
    timesUsed: 0,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("a rule applied to N transactions is credited with exactly N in ruleUsage", () => {
  const rows = [
    row({ referenceCode: "ref-1", merchant: "SAMPLE MERCHANT A" }),
    row({ referenceCode: "ref-2", merchant: "SAMPLE MERCHANT B" }),
    row({ referenceCode: "ref-3", merchant: "SAMPLE MERCHANT C" }),
  ];
  const rules = [rule({ id: "rule-1", merchantPattern: "SAMPLE" })];

  const result = applyRulesToRows(rows, rules);

  assert.equal(result.rows.every((r) => r.categoryId === "cat-1"), true);
  assert.deepEqual(result.ruleUsage, { "rule-1": 3 });
});

test("a rule that matches nothing gets no entry in ruleUsage, not a zero one", () => {
  const rows = [row({ merchant: "SOMETHING ELSE ENTIRELY" })];
  const rules = [rule({ id: "rule-1", merchantPattern: "SAMPLE" })];

  const result = applyRulesToRows(rows, rules);

  assert.equal(result.rows[0].categoryId, null);
  assert.deepEqual(result.ruleUsage, {});
});

test("no rules configured leaves rows untouched and ruleUsage empty", () => {
  const rows = [row()];

  const result = applyRulesToRows(rows, []);

  assert.equal(result.rows[0].categoryId, null);
  assert.deepEqual(result.ruleUsage, {});
});

test("each matching rule is credited separately when different rows match different rules", () => {
  const rows = [row({ referenceCode: "ref-1", merchant: "GROCERY STORE" }), row({ referenceCode: "ref-2", merchant: "GAS STATION" })];
  const rules = [rule({ id: "groceries", merchantPattern: "GROCERY", categoryId: "cat-groceries" }), rule({ id: "gas", merchantPattern: "GAS", categoryId: "cat-gas" })];

  const result = applyRulesToRows(rows, rules);

  assert.deepEqual(result.ruleUsage, { groceries: 1, gas: 1 });
});
