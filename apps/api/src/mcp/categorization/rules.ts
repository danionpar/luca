import { categorizationRules } from "../../db/schema.js";
import type { LucaDb } from "../queries/db-types.js";
import { runMutation, runQuery, runQueryOne } from "../queries/raw-sql.js";
import type { BulkCategorizeResult } from "./bulk-categorize.js";
import { bulkCategorize } from "./bulk-categorize.js";

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
 * Pass `applyToExisting: true` to also apply it right away to transactions
 * that already exist and currently have no category — it deliberately never
 * overwrites a transaction that already has a different category, since
 * that may have been set intentionally; use `bulk_categorize` directly (it
 * has no such restriction) to override existing categorizations instead.
 */
export function createRule(db: LucaDb, options: CreateRuleOptions): CreateRuleResult {
  const [inserted] = db
    .insert(categorizationRules)
    .values({ categoryId: options.categoryId, merchantPattern: options.merchantPattern })
    .returning()
    .all();

  const rule = toRuleRow({
    id: inserted.id,
    categoryId: inserted.categoryId,
    merchantPattern: inserted.merchantPattern,
    timesUsed: inserted.timesUsed,
    createdAt: Math.floor(inserted.createdAt.getTime() / 1000),
    updatedAt: Math.floor(inserted.updatedAt.getTime() / 1000),
  });

  if (!options.applyToExisting) return { rule };

  const applied = bulkCategorize(db, {
    merchantPattern: options.merchantPattern,
    categoryId: options.categoryId,
    onlyUncategorized: true,
  });

  return { rule, applied };
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
