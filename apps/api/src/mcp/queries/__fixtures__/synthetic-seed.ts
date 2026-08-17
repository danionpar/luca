import { categories, categorizationRules, transactions } from "../../../db/schema.js";
import type { LucaDb } from "../db-types.js";

// Synthetic seed helpers for query/categorization tests. Nothing here is a
// real merchant, card number or amount — this repository is public and no
// fixture may resemble real financial data.

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export interface SeedCategoryOverrides {
  id?: string;
  name?: string;
  emoji?: string;
  type?: "income" | "expense" | "saving";
}

export function seedCategory(db: LucaDb, overrides: SeedCategoryOverrides = {}): string {
  const id = overrides.id ?? nextId("cat");
  db.insert(categories)
    .values({
      id,
      name: overrides.name ?? "Test Category",
      emoji: overrides.emoji ?? "🧪",
      type: overrides.type ?? "expense",
    })
    .run();
  return id;
}

export interface SeedTransactionOverrides {
  id?: string;
  categoryId?: string | null;
  type?: "income" | "expense" | "saving";
  amount?: number;
  merchant?: string | null;
  description?: string | null;
  transactionDate?: string;
  billingMonth?: string | null;
  section?: "single" | "installment" | "charge" | "payment" | "pat" | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  referenceCode?: string | null;
  source?: "email" | "manual" | "statement";
}

// `??` cannot tell "not provided" apart from "explicitly overridden to
// null" (both are nullish), which matters here: a test seeding
// `merchant: null` or `section: null` on purpose must not silently fall
// back to the default. `in` distinguishes the two.
function pick<T extends object, K extends keyof T>(overrides: T, key: K, fallback: T[K]): T[K] {
  return key in overrides ? (overrides[key] as T[K]) : fallback;
}

export function seedTransaction(db: LucaDb, overrides: SeedTransactionOverrides = {}): string {
  const id = overrides.id ?? nextId("tx");
  db.insert(transactions)
    .values({
      id,
      categoryId: pick(overrides, "categoryId", null),
      type: overrides.type ?? "expense",
      amount: overrides.amount ?? 1000,
      merchant: pick(overrides, "merchant", "SAMPLE MERCHANT"),
      description: pick(overrides, "description", null),
      transactionDate: overrides.transactionDate ?? "2025-03-15",
      billingMonth: pick(overrides, "billingMonth", "2025-03"),
      section: pick(overrides, "section", "single"),
      installmentCurrent: pick(overrides, "installmentCurrent", 1),
      installmentTotal: pick(overrides, "installmentTotal", 1),
      referenceCode: pick(overrides, "referenceCode", nextId("ref")),
      source: overrides.source ?? "statement",
      bank: "banco-chile",
    })
    .run();
  return id;
}

export interface SeedRuleOverrides {
  id?: string;
  categoryId: string;
  merchantPattern: string;
  createdAtEpochSeconds?: number;
}

export function seedRule(db: LucaDb, overrides: SeedRuleOverrides): string {
  const id = overrides.id ?? nextId("rule");
  db.insert(categorizationRules)
    .values({
      id,
      categoryId: overrides.categoryId,
      merchantPattern: overrides.merchantPattern,
      ...(overrides.createdAtEpochSeconds !== undefined
        ? { createdAt: new Date(overrides.createdAtEpochSeconds * 1000), updatedAt: new Date(overrides.createdAtEpochSeconds * 1000) }
        : {}),
    })
    .run();
  return id;
}
