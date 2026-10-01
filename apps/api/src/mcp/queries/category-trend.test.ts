import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { categoryTrend } from "./category-trend.js";
import { proposeTrends } from "../insights/detector-proposals.js";
import { runQuery } from "./raw-sql.js";

const MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];

function seedSeries(db: ReturnType<typeof createTestDb>, categoryId: string | null, totals: number[]) {
  totals.forEach((amount, i) => {
    if (amount !== 0) seedTransaction(db, { categoryId, amount, billingMonth: MONTHS[i], transactionDate: `${MONTHS[i]}-10` });
  });
}

test("rising, falling and flat series get the right direction, with exact slope and totals", () => {
  const db = createTestDb();
  const up = seedCategory(db, { name: "Up" });
  const down = seedCategory(db, { name: "Down" });
  const steady = seedCategory(db, { name: "Steady" });
  seedSeries(db, up, [10000, 20000, 30000, 40000, 50000, 60000]);
  seedSeries(db, down, [60000, 50000, 40000, 30000, 20000, 10000]);
  seedSeries(db, steady, [30000, 30100, 29900, 30000, 30100, 29900]);

  const { series, fromMonth, toMonth } = categoryTrend(db);
  const by = Object.fromEntries(series.map((s) => [s.categoryName, s]));

  assert.equal(fromMonth, "2025-01");
  assert.equal(toMonth, "2025-06");
  assert.equal(by["Up"].direction, "rising");
  assert.equal(by["Up"].slopePerMonth, 10000);
  assert.equal(by["Up"].total, 210000);
  assert.equal(by["Down"].direction, "falling");
  assert.equal(by["Down"].slopePerMonth, -10000);
  assert.equal(by["Steady"].direction, "flat");
  assert.equal(by["Up"].months.length, 6);
  assert.deepEqual(by["Up"].months[0], { month: "2025-01", total: 10000 });
});

test("uncategorised spending is its own series and gaps are zero-filled", () => {
  const db = createTestDb();
  seedSeries(db, null, [0, 0, 0, 5000, 10000, 15000]);

  const { series } = categoryTrend(db);

  assert.equal(series.length, 1);
  assert.equal(series[0].categoryId, null);
  assert.equal(series[0].categoryName, "Uncategorized");
  assert.equal(series[0].direction, "rising");
  assert.deepEqual(series[0].months.map((m) => m.total), [0, 0, 0, 5000, 10000, 15000]);
});

test("payment, pat and projected rows do not enter a series", () => {
  const db = createTestDb();
  const cat = seedCategory(db, { name: "Real" });
  seedSeries(db, cat, [1000, 1000, 1000, 1000, 1000, 1000]);
  MONTHS.forEach((m) => seedTransaction(db, { categoryId: cat, amount: -500000, billingMonth: m, section: "payment" }));

  const { series } = categoryTrend(db);

  assert.equal(series[0].total, 6000);
});

test("window can end at an earlier month and refuses fewer than three points", () => {
  const db = createTestDb();
  seedSeries(db, null, [1000, 2000, 3000, 4000, 5000, 6000]);

  const r = categoryTrend(db, { months: 3, toMonth: "2025-04" });
  assert.equal(r.fromMonth, "2025-02");
  assert.deepEqual(r.series[0].months.map((m) => m.total), [2000, 3000, 4000]);
  assert.throws(() => categoryTrend(db, { months: 2 }), /at least 3/);
});

test("empty database yields no series", () => {
  assert.deepEqual(categoryTrend(createTestDb()).series, []);
});

test("saveAsInsights path proposes only moving series and upserts on rerun", () => {
  const db = createTestDb();
  const up = seedCategory(db, { name: "Up" });
  const steady = seedCategory(db, { name: "Steady" });
  seedSeries(db, up, [10000, 20000, 30000, 40000, 50000, 60000]);
  seedSeries(db, steady, [30000, 30000, 30000, 30000, 30000, 30000]);
  const result = categoryTrend(db);

  const first = proposeTrends(db, result);
  const second = proposeTrends(db, result);

  assert.equal(first.length, 1);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].revisionCount, 2);
  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM observations")[0].n, 1);
  assert.match(runQuery<{ content: string }>(db, "SELECT content FROM observations")[0].content, /PROPOSAL awaiting the owner's confirmation/);
  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM categorization_rules")[0].n, 0);
});
