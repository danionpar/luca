import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidYearMonth, precedingYearMonths, shiftYearMonth } from "./year-month.js";

test("isValidYearMonth accepts a well-formed YYYY-MM", () => {
  assert.equal(isValidYearMonth("2025-03"), true);
  assert.equal(isValidYearMonth("2025-12"), true);
});

test("isValidYearMonth rejects malformed or out-of-range input", () => {
  assert.equal(isValidYearMonth("2025-13"), false);
  assert.equal(isValidYearMonth("2025-00"), false);
  assert.equal(isValidYearMonth("2025-3"), false);
  assert.equal(isValidYearMonth("not-a-month"), false);
  assert.equal(isValidYearMonth("2025-03-01"), false);
});

test("shiftYearMonth moves forward within the same year", () => {
  assert.equal(shiftYearMonth("2025-03", 1), "2025-04");
});

test("shiftYearMonth moves backward within the same year", () => {
  assert.equal(shiftYearMonth("2025-03", -1), "2025-02");
});

test("shiftYearMonth rolls over a year boundary forward", () => {
  assert.equal(shiftYearMonth("2025-12", 1), "2026-01");
});

test("shiftYearMonth rolls over a year boundary backward", () => {
  assert.equal(shiftYearMonth("2025-01", -1), "2024-12");
});

test("shiftYearMonth handles a multi-year jump in both directions", () => {
  assert.equal(shiftYearMonth("2024-04", 24), "2026-04");
  assert.equal(shiftYearMonth("2026-04", -24), "2024-04");
});

test("precedingYearMonths lists the requested count, oldest first, excluding the given month", () => {
  assert.deepEqual(precedingYearMonths("2025-04", 3), ["2025-01", "2025-02", "2025-03"]);
});

test("precedingYearMonths returns an empty list for count 0", () => {
  assert.deepEqual(precedingYearMonths("2025-04", 0), []);
});
