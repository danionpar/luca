import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { monthlySummary } from "./monthly-summary.js";

test("totals per section and net spend are computed for the requested billing month only", () => {
  const db = createTestDb();
  seedTransaction(db, { billingMonth: "2025-04", section: "single", amount: 5000, installmentTotal: 1, installmentCurrent: 1 });
  seedTransaction(db, { billingMonth: "2025-04", section: "installment", amount: 3000, installmentTotal: 3, installmentCurrent: 2 });
  seedTransaction(db, { billingMonth: "2025-05", section: "single", amount: 9999, installmentTotal: 1, installmentCurrent: 1 });

  const summary = monthlySummary(db, "2025-04");

  assert.equal(summary.netSpend, 8000);
  const bySection = Object.fromEntries(summary.sections.map((s) => [s.section, s]));
  assert.equal(bySection.single.total, 5000);
  assert.equal(bySection.single.count, 1);
  assert.equal(bySection.installment.total, 3000);
  assert.equal(bySection.installment.count, 1);
});

test("compares against the previous month when it has data", () => {
  const db = createTestDb();
  seedTransaction(db, { billingMonth: "2025-03", amount: 4000 });
  seedTransaction(db, { billingMonth: "2025-04", amount: 8000 });

  const summary = monthlySummary(db, "2025-04");

  assert.equal(summary.previousMonth.month, "2025-03");
  assert.equal(summary.previousMonth.netSpend, 4000);
  assert.equal(summary.previousMonth.deltaAbsolute, 4000);
  assert.equal(summary.previousMonth.deltaPercent, 100);
});

test("previous month comparison is null when the previous month has no data at all", () => {
  const db = createTestDb();
  seedTransaction(db, { billingMonth: "2025-04", amount: 8000 });

  const summary = monthlySummary(db, "2025-04");

  assert.equal(summary.previousMonth.netSpend, null);
  assert.equal(summary.previousMonth.deltaAbsolute, null);
  assert.equal(summary.previousMonth.deltaPercent, null);
});

test("trailing average only includes months that actually have data, and reports how many that was", () => {
  const db = createTestDb();
  seedTransaction(db, { billingMonth: "2025-03", amount: 4000 });
  seedTransaction(db, { billingMonth: "2025-04", amount: 8000 });

  const summary = monthlySummary(db, "2025-04", 3);

  assert.equal(summary.trailingAverage.monthsRequested, 3);
  assert.equal(summary.trailingAverage.monthsWithData, 1);
  assert.equal(summary.trailingAverage.netSpend, 4000);
  assert.equal(summary.trailingAverage.deltaAbsolute, 4000);
});

test("trailing average across multiple prior months divides evenly in SQL", () => {
  const db = createTestDb();
  seedTransaction(db, { billingMonth: "2025-01", amount: 2000 });
  seedTransaction(db, { billingMonth: "2025-02", amount: 4000 });
  seedTransaction(db, { billingMonth: "2025-03", amount: 6000 });
  seedTransaction(db, { billingMonth: "2025-04", amount: 9000 });

  const summary = monthlySummary(db, "2025-04", 3);

  // (2000 + 4000 + 6000) / 3 = 4000
  assert.equal(summary.trailingAverage.monthsWithData, 3);
  assert.equal(summary.trailingAverage.netSpend, 4000);
  assert.equal(summary.trailingAverage.deltaAbsolute, 5000);
});

test("a month with no transactions at all reports zero net spend and no sections", () => {
  const db = createTestDb();

  const summary = monthlySummary(db, "2025-04");

  assert.equal(summary.netSpend, 0);
  assert.deepEqual(summary.sections, []);
});
