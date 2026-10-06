import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "./__fixtures__/synthetic-seed.js";
import { detectRecurring } from "./detect-recurring.js";
import { proposeRecurring } from "../insights/detector-proposals.js";
import { runQuery } from "./raw-sql.js";

const MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04"];

function seedMonthly(db: ReturnType<typeof createTestDb>, merchant: string, amount: number, extra: Parameters<typeof seedTransaction>[1] = {}) {
  for (const m of MONTHS) seedTransaction(db, { merchant, amount, billingMonth: m, transactionDate: `${m}-10`, ...extra });
}

test("a monthly subscription is detected with cadence, months and totals", () => {
  const db = createTestDb();
  seedMonthly(db, "STREAMCO", 8990);

  const { clusters, totalClusters } = detectRecurring(db);

  assert.equal(totalClusters, 1);
  assert.equal(clusters.length, 1);
  const c = clusters[0];
  assert.equal(c.merchant, "STREAMCO");
  assert.equal(c.cadence, "monthly");
  assert.equal(c.months, 4);
  assert.equal(c.firstMonth, "2025-01");
  assert.equal(c.lastMonth, "2025-04");
  assert.equal(c.typicalAmount, 8990);
  assert.equal(c.totalAmount, 35960);
  assert.equal(c.categorisation, "uncategorised");
});

test("instalment rows are NOT reported as recurring", () => {
  const db = createTestDb();
  MONTHS.forEach((m, i) =>
    seedTransaction(db, { merchant: "FURNITURE STORE", amount: 25000, billingMonth: m, section: "installment", installmentCurrent: i + 1, installmentTotal: 12 }),
  );
  // Legacy row shape: no section, but installment_total > 1.
  MONTHS.forEach((m, i) =>
    seedTransaction(db, { merchant: "LEGACY SHOP", amount: 9000, billingMonth: m, section: null, installmentCurrent: i + 1, installmentTotal: 6 }),
  );

  assert.equal(detectRecurring(db).clusters.length, 0);
});

test("payment rows are excluded", () => {
  const db = createTestDb();
  seedMonthly(db, "PAYMENT RECEIVED", 100000, { section: "payment" });

  assert.equal(detectRecurring(db).clusters.length, 0);
});

test("a monthly pat bill (same merchant, same amount) IS reported as recurring", () => {
  const db = createTestDb();
  seedMonthly(db, "ELECTRIC CO", 45000, { section: "pat" });

  const { clusters } = detectRecurring(db);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].merchant, "ELECTRIC CO");
  assert.equal(clusters[0].cadence, "monthly");
  assert.equal(clusters[0].months, 4);
  assert.equal(clusters[0].totalAmount, 180000);
});

test("projected rows and refunds are excluded", () => {
  const db = createTestDb();
  MONTHS.forEach((m) => seedTransaction(db, { merchant: "FUTURE", amount: 5000, billingMonth: m }));
  db.$client.prepare("UPDATE transactions SET is_projected = 1").run();
  seedMonthly(db, "REFUNDER", -5000);

  assert.equal(detectRecurring(db).clusters.length, 0);
});

test("one merchant with two different recurring amounts yields two clusters", () => {
  const db = createTestDb();
  seedMonthly(db, "GATEWAY", 5990);
  seedMonthly(db, "GATEWAY", 15990);

  const { clusters } = detectRecurring(db);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((c) => c.anchorAmount).sort((a, b) => a - b), [5990, 15990]);
});

test("amounts within the tolerance share a cluster; exact mode splits them", () => {
  const db = createTestDb();
  ["2025-01", "2025-02", "2025-03"].forEach((m, i) => seedTransaction(db, { merchant: "USD SERVICE", amount: 10000 + i * 100, billingMonth: m }));

  assert.equal(detectRecurring(db, { amountTolerance: 0.03 }).clusters.length, 1);
  assert.equal(detectRecurring(db, { amountTolerance: 0 }).clusters.length, 0);
});

test("fewer than minMonths distinct months is not recurring, even with many rows", () => {
  const db = createTestDb();
  for (let i = 0; i < 5; i++) seedTransaction(db, { merchant: "BURST", amount: 3000, billingMonth: "2025-01" });
  seedTransaction(db, { merchant: "BURST", amount: 3000, billingMonth: "2025-02" });

  assert.equal(detectRecurring(db).clusters.length, 0);
  assert.equal(detectRecurring(db, { minMonths: 2 }).clusters.length, 1);
});

test("categorisation flag distinguishes categorised, partial and uncategorised clusters", () => {
  const db = createTestDb();
  const cat = seedCategory(db);
  seedMonthly(db, "KNOWN", 4000, { categoryId: cat });
  MONTHS.forEach((m, i) => seedTransaction(db, { merchant: "MIXED", amount: 7000, billingMonth: m, categoryId: i === 0 ? cat : null }));

  const byMerchant = Object.fromEntries(detectRecurring(db).clusters.map((c) => [c.merchant, c]));
  assert.equal(byMerchant["KNOWN"].categorisation, "categorised");
  assert.equal(byMerchant["MIXED"].categorisation, "partial");
  assert.equal(byMerchant["MIXED"].uncategorisedRows, 3);
  assert.equal(detectRecurring(db, { onlyUncategorised: true }).clusters.length, 1);
});

test("a gappy series is reported as irregular", () => {
  const db = createTestDb();
  ["2025-01", "2025-05", "2025-09"].forEach((m) => seedTransaction(db, { merchant: "SEASONAL", amount: 2000, billingMonth: m }));

  assert.equal(detectRecurring(db).clusters[0].cadence, "irregular");
});

test("saveAsInsights path upserts: revision_count goes up, row count does not", () => {
  const db = createTestDb();
  seedMonthly(db, "STREAMCO", 8990);
  const { clusters } = detectRecurring(db);

  const first = proposeRecurring(db, clusters);
  const second = proposeRecurring(db, clusters);

  assert.equal(first[0].topicKey, "recurring/streamco/8990");
  assert.equal(first[0].created, true);
  assert.equal(second[0].upserted, true);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].revisionCount, 2);
  const [{ n }] = runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM observations");
  assert.equal(n, 1);
  const [{ content }] = runQuery<{ content: string }>(db, "SELECT content FROM observations");
  assert.match(content, /PROPOSAL awaiting the owner's confirmation/);
  assert.match(content, /4 distinct billing months/);
});

test("proposing never creates rules or categorises transactions", () => {
  const db = createTestDb();
  seedMonthly(db, "STREAMCO", 8990);
  proposeRecurring(db, detectRecurring(db).clusters);

  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM categorization_rules")[0].n, 0);
  assert.equal(runQuery<{ n: number }>(db, "SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NOT NULL")[0].n, 0);
});
