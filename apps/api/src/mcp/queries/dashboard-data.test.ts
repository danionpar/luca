import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { dashboardData } from "./dashboard-data.js";
import { monthlySummary } from "./monthly-summary.js";

function seedScenario() {
  const db = createTestDb();
  const food = seedCategory(db, { name: "Food" });
  const travel = seedCategory(db, { name: "Travel" });
  seedTransaction(db, { billingMonth: "2025-03", amount: 5000, categoryId: food, city: "SANTIAGO" });
  seedTransaction(db, { billingMonth: "2025-03", amount: 2000, categoryId: null, city: "SANTIAGO" });
  seedTransaction(db, { billingMonth: "2025-03", amount: 700, categoryId: travel, city: null });
  seedTransaction(db, { billingMonth: "2025-03", amount: -90000, section: "payment", installmentTotal: null });
  seedTransaction(db, { billingMonth: "2025-03", amount: -1000, section: "pat" });
  seedTransaction(db, { billingMonth: "2025-04", amount: 3000, categoryId: food, city: "VALPARAISO" });
  seedTransaction(db, { billingMonth: "2026-01", amount: 4000, categoryId: travel, city: "VALPARAISO" });
  return db;
}

test("month totals tie out with monthly_summary minus its payment and pat sections", () => {
  const db = seedScenario();
  const data = dashboardData(db);

  for (const m of data.months) {
    const summary = monthlySummary(db, m.month);
    const excluded = summary.sections.filter((s) => s.section === "payment" || s.section === "pat").reduce((a, s) => a + s.total, 0);
    assert.equal(m.total, summary.netSpend - excluded, `month ${m.month}`);
  }
  assert.equal(data.months.find((m) => m.month === "2025-03")?.total, 7700);
});

test("payments and pat rows never count as spending", () => {
  const data = dashboardData(seedScenario());
  assert.equal(data.months.find((m) => m.month === "2025-03")?.count, 3);
  assert.ok(data.categories.every((c) => c.total > 0));
});

test("uncategorized spending is its own explicit bucket and categorized counts add up", () => {
  const data = dashboardData(seedScenario());
  const bucket = data.categories.find((c) => c.categoryId === null);
  assert.equal(bucket?.name, "Uncategorized");
  assert.equal(bucket?.total, 2000);
  const march = data.months.find((m) => m.month === "2025-03");
  assert.equal(march?.categorizedCount, 2);
  assert.equal(data.categoryMonths.find((c) => c.categoryId === null && c.month === "2025-03")?.count, 1);
});

test("years, categories, cities and the month cells all sum to the same grand total", () => {
  const data = dashboardData(seedScenario());
  const sum = (rows: { total: number }[]) => rows.reduce((a, r) => a + r.total, 0);
  const grand = sum(data.months);
  assert.equal(grand, 7700 + 3000 + 4000);
  assert.equal(sum(data.years), grand);
  assert.equal(sum(data.categories), grand);
  assert.equal(sum(data.categoryMonths), grand);
  assert.equal(sum(data.cities), grand);
  assert.equal(sum(data.cityMonths), grand);
  assert.deepEqual(data.years.map((y) => [y.year, y.total]), [["2025", 10700], ["2026", 4000]]);
});

test("rows without a city land in an explicit null-city bucket", () => {
  const data = dashboardData(seedScenario());
  assert.equal(data.cities.find((c) => c.city === null)?.total, 700);
  assert.equal(data.cities.find((c) => c.city === "SANTIAGO")?.total, 7000);
});

test("an empty database yields empty aggregates", () => {
  const data = dashboardData(createTestDb());
  assert.deepEqual(data, { months: [], years: [], categories: [], categoryMonths: [], cities: [], cityMonths: [] });
});
