import { test } from "node:test";
import assert from "node:assert/strict";

import { pickMatchingRule } from "./rule-matching.js";
import type { MatchableRule } from "./rule-matching.js";

function rule(overrides: Partial<MatchableRule>): MatchableRule {
  return {
    id: "rule-1",
    categoryId: "cat-1",
    merchantPattern: "PATTERN",
    timesUsed: 0,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("returns null for a merchant with no matching rule", () => {
  const result = pickMatchingRule("TIENDA EJEMPLO", [rule({ merchantPattern: "OTRO" })]);
  assert.equal(result, null);
});

test("returns null when merchant is null or undefined", () => {
  const rules = [rule({ merchantPattern: "TIENDA" })];
  assert.equal(pickMatchingRule(null, rules), null);
  assert.equal(pickMatchingRule(undefined, rules), null);
});

test("matches case-insensitively as a substring", () => {
  const match = rule({ id: "r1", merchantPattern: "tienda" });
  const result = pickMatchingRule("SUPER TIENDA EJEMPLO", [match]);
  assert.equal(result?.id, "r1");
});

test("the most specific (longest) matching pattern wins", () => {
  const broad = rule({ id: "broad", merchantPattern: "TIENDA" });
  const specific = rule({ id: "specific", merchantPattern: "TIENDA EJEMPLO SUCURSAL" });

  const result = pickMatchingRule("TIENDA EJEMPLO SUCURSAL CENTRO", [broad, specific]);
  assert.equal(result?.id, "specific");
});

test("ties on pattern length are broken by whichever rule has categorized more transactions (timesUsed)", () => {
  const proven = rule({ id: "proven", merchantPattern: "TIENDA1", timesUsed: 12, createdAt: new Date("2025-01-01T00:00:00Z") });
  const untested = rule({ id: "untested", merchantPattern: "TIENDA2", timesUsed: 0, createdAt: new Date("2024-01-01T00:00:00Z") });
  // Both patterns are 7 chars; craft a merchant that (artificially) contains
  // both so the tie-break is actually exercised. `untested` is the older
  // rule, so this also proves timesUsed is checked before createdAt.
  const merchant = "TIENDA1 TIENDA2 STORE";

  const result = pickMatchingRule(merchant, [untested, proven]);
  assert.equal(result?.id, "proven");
});

test("ties on both pattern length and timesUsed are broken by the oldest rule", () => {
  const older = rule({ id: "older", merchantPattern: "TIENDA1", timesUsed: 3, createdAt: new Date("2024-01-01T00:00:00Z") });
  const newer = rule({ id: "newer", merchantPattern: "TIENDA2", timesUsed: 3, createdAt: new Date("2025-01-01T00:00:00Z") });
  const merchant = "TIENDA1 TIENDA2 STORE";

  const result = pickMatchingRule(merchant, [newer, older]);
  assert.equal(result?.id, "older");
});
