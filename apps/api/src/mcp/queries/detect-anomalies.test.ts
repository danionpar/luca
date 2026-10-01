import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { detectAnomalies } from "./detect-anomalies.js";
import { proposeAnomalies } from "../insights/detector-proposals.js";
import { runQuery } from "./raw-sql.js";

const MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"];

function seedSeries(db: ReturnType<typeof createTestDb>, categoryId: string | null, totals: number[]) {
  totals.forEach((amount, i) => {
    if (amount !== 0) seedTransaction(db, { categoryId, amount, billingMonth: MONTHS[i], transactionDate: `${MONTHS[i]}-10` });
  });
}

test("a spike over the trailing average is reported with value, average, delta and ratio", () => {
  const db = createTestDb();
  const cat = seedCategory(db, { name: "Dining" });
  seedSeries(db, cat, [40000, 40000, 40000, 40000, 40000, 40000, 100000]);

  const result = detectAnomalies(db);

  assert.equal(result.billingMonth, "2025-07");
  assert.equal(result.anomalies.length, 1);
  const a = result.anomalies[0];
  assert.equal(a.categoryName, "Dining");
  assert.equal(a.value, 100000);
  assert.equal(a.trailingAverage, 40000);
  assert.equal(a.delta, 60000);
  assert.equal(a.ratio, 2.5);
  assert.equal(a.direction, "above");
});

test("a steady month is not flagged, and a small deviation below minDelta is ignored", () => {
  const db = createTestDb();
  const steady = seedCategory(db, { name: "Steady" });
  const tiny = seedCategory(db, { name: "Tiny" });
  seedSeries(db, steady, [40000, 40000, 40000, 40000, 40000, 40000, 42000]);
  seedSeries(db, tiny, [1000, 1000, 1000, 1000, 1000, 1000, 5000]);

  assert.equal(detectAnomalies(db).anomalies.length, 0);
  assert.equal(detectAnomalies(db, { minDelta: 1000 }).anomalies.length, 1);
});

test("a category with thin history is not flagged on noise", () => {
  const db = createTestDb();
  const thin = seedCategory(db, { name: "Thin" });
  const anchor = seedCategory(db, { name: "Anchor" });
  seedSeries(db, anchor, [10000, 10000, 10000, 10000, 10000, 10000, 10000]);
  seedSeries(db, thin, [0, 0, 0, 0, 20000, 20000, 200000]);

  assert.equal(detectAnomalies(db).anomalies.length, 0);
  const relaxed = detectAnomalies(db, { minHistoryMonths: 2 });
  assert.equal(relaxed.anomalies.length, 1);
  assert.equal(relaxed.anomalies[0].categoryName, "Thin");
});

test("a category that went silent is reported below, and uncategorised is its own series", () => {
  const db = createTestDb();
  const quiet = seedCategory(db, { name: "Quiet" });
  seedSeries(db, quiet, [50000, 50000, 50000, 50000, 50000, 50000, 0]);
  seedSeries(db, null, [20000, 20000, 20000, 20000, 20000, 20000, 90000]);

  const { anomalies } = detectAnomalies(db);
  const by = Object.fromEntries(anomalies.map((a) => [a.categoryName, a]));

  assert.equal(by["Quiet"].direction, "below");
  assert.equal(by["Quiet"].value, 0);
  assert.equal(by["Quiet"].ratio, 0);
  assert.equal(by["Uncategorized"].categoryId, null);
  assert.equal(by["Uncategorized"].direction, "above");
});

test("explicit billingMonth and empty database", () => {
  const db = createTestDb();
  assert.equal(detectAnomalies(db).billingMonth, null);
  const cat = seedCategory(db);
  seedSeries(db, cat, [40000, 40000, 40000, 40000, 40000, 40000, 100000]);
  assert.equal(detectAnomalies(db, { billingMonth: "2025-06" }).anomalies.length, 0);
});

test("saveAsInsights path upserts as a warning proposal and never touches rules or transactions", () => {
  const db = createTestDb();
  const cat = seedCategory(db, { name: "Dining" });
  seedSeries(db, cat, [40000, 40000, 40000, 40000, 40000, 40000, 100000]);
  const result = detectAnomalies(db);

  const first = proposeAnomalies(db, result);
  const second = proposeAnomalies(db, result);

  assert.equal(first[0].topicKey, `anomaly/2025-07/${cat}`);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].revisionCount, 2);
  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM observations")[0].n, 1);
  assert.equal(runQuery<{ type: string }>(db, "SELECT type FROM observations")[0].type, "warning");
  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM categorization_rules")[0].n, 0);
});
