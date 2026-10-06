import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Script } from "node:vm";

import { createTestDb } from "../queries/__fixtures__/test-db.js";
import { seedCategory, seedTransaction } from "../queries/__fixtures__/synthetic-seed.js";
import { DASHBOARD_CLIENT_JS } from "./dashboard-client.js";
import { jsonForScript, renderDashboardHtml } from "./render-html.js";
import { DEFAULT_DASHBOARD_PATH, resolveOutputPath, writeDashboard } from "./write-dashboard.js";
import { dashboardData } from "../queries/dashboard-data.js";

function seededDb() {
  const db = createTestDb();
  const food = seedCategory(db, { name: "Food" });
  seedTransaction(db, { billingMonth: "2025-03", amount: 5000, categoryId: food, city: "SANTIAGO" });
  seedTransaction(db, { billingMonth: "2025-03", amount: 2000, city: "</script><b>X" });
  seedTransaction(db, { billingMonth: "2025-04", amount: -9000, section: "payment" });
  return db;
}

test("the rendered page references no network resource", () => {
  const html = renderDashboardHtml(dashboardData(seededDb()), new Date("2026-01-01T00:00:00Z"));
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?(?!#)/i);
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
});

test("the embedded client script is syntactically valid", () => {
  assert.doesNotThrow(() => new Script(DASHBOARD_CLIENT_JS));
});

test("data cannot break out of its script block", () => {
  const html = renderDashboardHtml(dashboardData(seededDb()), new Date());
  assert.equal(html.match(/<\/script>/g)?.length, 2, "only the page's own two script blocks may close");
  assert.ok(jsonForScript({ a: "</script>" }).includes("\\u003c/script>"));
});

test("writeDashboard creates the directory, writes the file and skips opening on request", () => {
  const dir = mkdtempSync(join(tmpdir(), "luca-dash-"));
  try {
    const target = join(dir, "nested", "dashboard.html");
    let opened = 0;
    const result = writeDashboard(seededDb(), { outputPath: target, open: false, opener: () => (opened += 1) });
    assert.equal(opened, 0);
    assert.equal(result.opened, false);
    assert.equal(result.path, target);
    assert.equal(result.months, 1);
    assert.equal(result.transactions, 2);
    assert.match(readFileSync(target, "utf-8"), /^<!doctype html>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeDashboard opens the written file by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "luca-dash-"));
  try {
    const target = join(dir, "d.html");
    const openedPaths: string[] = [];
    writeDashboard(seededDb(), { outputPath: target, opener: (p) => openedPaths.push(p) });
    assert.deepEqual(openedPaths, [target]);
    assert.ok(existsSync(target));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the default output path is outside the repository and ~ expands to the home directory", () => {
  assert.equal(DEFAULT_DASHBOARD_PATH, join(homedir(), "Documents", "luca", "dashboard.html"));
  assert.equal(resolveOutputPath(undefined), DEFAULT_DASHBOARD_PATH);
  assert.equal(resolveOutputPath("~/x/y.html"), join(homedir(), "x", "y.html"));
  const repoRoot = join(import.meta.dirname, "../../../../..");
  assert.ok(relative(repoRoot, DEFAULT_DASHBOARD_PATH).startsWith(".."), "default output must not be inside the repo");
});
