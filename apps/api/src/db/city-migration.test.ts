import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const CITY_MIGRATION = "0006_lean_lady_ursula.sql";

test("city migration moves description into city and nulls description", () => {
  const sqlite = new Database(":memory:");
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => f < CITY_MIGRATION)) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf-8"));
  }

  const insert = sqlite.prepare(
    "INSERT INTO transactions (id, type, amount, merchant, description, transaction_date) VALUES (?, 'expense', 1000, 'SAMPLE', ?, '2025-03-15')",
  );
  insert.run("a", "SANTIAGO");
  insert.run("b", "PROVIDENCI");
  insert.run("c", null);

  sqlite.exec(readFileSync(join(MIGRATIONS_DIR, CITY_MIGRATION), "utf-8"));

  const rows = sqlite.prepare("SELECT id, city, description FROM transactions ORDER BY id").all();
  assert.deepEqual(rows, [
    { id: "a", city: "SANTIAGO", description: null },
    { id: "b", city: "PROVIDENCI", description: null },
    { id: "c", city: null, description: null },
  ]);
});
