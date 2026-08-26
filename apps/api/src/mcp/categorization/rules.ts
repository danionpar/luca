import { categorizationRules } from "../../db/schema.js";
import type { LucaDb } from "../queries/db-types.js";
import { runMutation, runQuery, runQueryOne } from "../queries/raw-sql.js";
import type { BulkCategorizeResult } from "./bulk-categorize.js";
import { bulkCategorize } from "./bulk-categorize.js";

/**
 * Credits every rule in `ruleUsage` (rule id -> row count) with having
 * categorized that many more transactions: `times_used` goes up by exactly
 * that count and `updated_at` moves forward, in one write per rule. A rule
 * id with no entry in `ruleUsage` is left completely untouched.
 *
 * Shared by every path that actually applies a rule to a transaction —
 * `createRule`'s `applyToExisting` pass and the ingestion pipeline's
 * `persistImportedStatement` (see db-deps.ts) both funnel through this, so
 * "what counts as a rule being used" has exactly one implementation.
 */
export function creditRuleUsage(db: LucaDb, ruleUsage: Record<string, number>): void {
  for (const [ruleId, count] of Object.entries(ruleUsage)) {
    if (count <= 0) continue;
    runMutation(db, "UPDATE categorization_rules SET times_used = times_used + ?, updated_at = unixepoch() WHERE id = ?", [count, ruleId]);
  }
}

export interface RuleRow {
  id: string;
  categoryId: string;
  merchantPattern: string;
  timesUsed: number;
  createdAt: string;
  updatedAt: string;
}

function toIsoString(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

interface RawRuleRow {
  id: string;
  categoryId: string;
  merchantPattern: string;
  timesUsed: number;
  createdAt: number;
  updatedAt: number;
}

function toRuleRow(raw: RawRuleRow): RuleRow {
  return { ...raw, createdAt: toIsoString(raw.createdAt), updatedAt: toIsoString(raw.updatedAt) };
}

export interface CreateRuleOptions {
  merchantPattern: string;
  categoryId: string;
  /** When true, immediately runs the rule against existing rows — but only currently-uncategorized ones, so it never overwrites a category set some other way. */
  applyToExisting?: boolean;
}

export interface CreateRuleResult {
  rule: RuleRow;
  /** Present only when `applyToExisting` was true. */
  applied?: BulkCategorizeResult;
}

/**
 * Persists a merchant-pattern-to-category rule that future `import_statements`
 * runs will apply automatically to newly imported transactions (see
 * `applyRulesToRows` in the ingestion pipeline).
 *
 * A freshly created rule starts with `timesUsed: 0` — it has not
 * categorized anything yet. Pass `applyToExisting: true` to also apply it
 * right away to transactions that already exist and currently have no
 * category — it deliberately never overwrites a transaction that already
 * has a different category, since that may have been set intentionally;
 * use `bulk_categorize` directly (it has no such restriction) to override
 * existing categorizations instead. When this immediate pass does touch
 * rows, `timesUsed` is set to exactly how many it touched (`applied.updated`)
 * rather than staying at 0, so the counter always reflects transactions the
 * rule has actually categorized.
 */
export function createRule(db: LucaDb, options: CreateRuleOptions): CreateRuleResult {
  const [inserted] = db
    .insert(categorizationRules)
    .values({ categoryId: options.categoryId, merchantPattern: options.merchantPattern })
    .returning()
    .all();

  let applied: BulkCategorizeResult | undefined;

  if (options.applyToExisting) {
    applied = bulkCategorize(db, {
      merchantPattern: options.merchantPattern,
      categoryId: options.categoryId,
      onlyUncategorized: true,
    });

    creditRuleUsage(db, { [inserted.id]: applied.updated });
  }

  // Re-read rather than trust `inserted`: `creditRuleUsage` may just have
  // moved `times_used` and `updated_at` forward in the database.
  const stored = runQueryOne<RawRuleRow>(
    db,
    `SELECT id, category_id as categoryId, merchant_pattern as merchantPattern, times_used as timesUsed, created_at as createdAt, updated_at as updatedAt
     FROM categorization_rules WHERE id = ?`,
    [inserted.id],
  );
  if (!stored) throw new Error(`Rule ${inserted.id} vanished immediately after being inserted.`);

  return { rule: toRuleRow(stored), applied };
}

/** Every stored categorization rule, oldest first (the order ties resolve in favor of, when matching). */
export function listRules(db: LucaDb): RuleRow[] {
  const rows = runQuery<RawRuleRow>(
    db,
    `SELECT id, category_id as categoryId, merchant_pattern as merchantPattern, times_used as timesUsed, created_at as createdAt, updated_at as updatedAt
     FROM categorization_rules
     ORDER BY created_at ASC`,
  );
  return rows.map(toRuleRow);
}

export interface DeleteRuleResult {
  ruleId: string;
  deleted: boolean;
}

/** Deletes a rule by id. Transactions it previously categorized are left exactly as they are — deleting a rule never uncategorizes anything. */
export function deleteRule(db: LucaDb, ruleId: string): DeleteRuleResult {
  const existing = runQueryOne<{ id: string }>(db, "SELECT id FROM categorization_rules WHERE id = ?", [ruleId]);
  if (!existing) return { ruleId, deleted: false };

  runMutation(db, "DELETE FROM categorization_rules WHERE id = ?", [ruleId]);
  return { ruleId, deleted: true };
}
