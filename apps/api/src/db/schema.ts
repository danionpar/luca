import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// SQLite has no native enum type; the allowed values are enforced at the
// column level via `text({ enum: [...] })` instead of a separate pgEnum.
export const transactionTypes = ["income", "expense", "saving"] as const;
export const transactionSources = ["email", "manual", "statement"] as const;
export const categoryTypes = ["income", "expense", "saving"] as const;
// Mirrors the parser's own `ParsedTransaction["section"]` (see
// statement-text-parser.ts) — the printed statement section a line belongs
// to. Persisted from the parser's own classification at ingestion time so it
// never has to be re-derived from amount sign or installment counts, which
// cannot reliably distinguish e.g. a PAT from a manual payment.
export const transactionSections = ["single", "installment", "charge", "payment", "pat"] as const;

// App tables
export const categories = sqliteTable("categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  type: text("type", { enum: categoryTypes }).notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const transactions = sqliteTable("transactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  type: text("type", { enum: transactionTypes }).notNull(),
  // Chilean pesos have no cents — money columns are always integers, never floats.
  amount: integer("amount").notNull(),
  merchant: text("merchant"),
  description: text("description"),
  // YYYY-MM-DD, kept as plain text — never a native date/timestamp type.
  transactionDate: text("transaction_date").notNull(),
  source: text("source", { enum: transactionSources })
    .notNull()
    .default("manual"),
  bank: text("bank"),
  paymentMethod: text("payment_method"),
  rawEmailUid: text("raw_email_uid"),
  // Bank-issued authorization/reference code for a statement-imported row.
  // This is the idempotency key that lets a re-import of the same PDF (or
  // an overlapping one) skip a transaction it already wrote, independent of
  // the statement-level duplicate check.
  referenceCode: text("reference_code"),
  billingMonth: text("billing_month"), // YYYY-MM, the statement cycle this belongs to
  // The printed statement section this row came from. Nullable because rows
  // imported before this column existed have no value here — see
  // `effectiveSectionExpr` in mcp/queries/section.ts for how those legacy
  // rows are surfaced instead of silently mis-bucketed.
  section: text("section", { enum: transactionSections }),
  isProjected: integer("is_projected", { mode: "boolean" })
    .notNull()
    .default(false),
  installmentCurrent: integer("installment_current"), // e.g. 3 of 6
  installmentTotal: integer("installment_total"), // e.g. 6
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const categorizationRules = sqliteTable("categorization_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  merchantPattern: text("merchant_pattern").notNull(),
  // Count of transactions this rule has actually categorized — bumped at
  // ingestion time (`applyRulesToRows`, see rule-application.ts) and, when
  // `create_rule` is called with `applyToExisting: true`, by the rows that
  // immediate pass touches. Starts at 0: a freshly created rule has
  // categorized nothing yet. Used as a tiebreaker in `pickMatchingRule`
  // when two rules of equal pattern specificity match the same merchant.
  timesUsed: integer("times_used").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Layer 2 — insight store, modeled on engram (see
// docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md,
// "Layer 2 — Insight store (modeled on engram)"). No engram code is reused
// (engram is Go, this is TypeScript); the tables below are a fresh
// implementation of the same design, derived from reading engram's actual
// store code, not just its docs.
//
// Deliberately NOT copied from engram, to avoid schema debt:
// - No `embedding` / `embedding_model` / `embedding_created_at` columns.
//   Engram declares them and never writes to any of them; retrieval here is
//   FTS5/BM25 only. Vectors are a later optimization if that ever proves
//   insufficient, not a prerequisite.
// - No `superseded_at` / `superseded_by_relation_id`. Engram declares these
//   but nothing follows the chain, so they are unused schema. Add them only
//   alongside logic that actually walks a supersede chain.
export const relationTypes = ["related", "compatible", "scoped", "conflicts_with", "supersedes", "not_conflict"] as const;
// `pending` is a judgment *state* (candidate detection not yet resolved),
// never a verb the model picks when creating a relation directly — that is
// why it lives in a separate column/vocabulary from `relationTypes` above.
export const judgmentStatuses = ["pending", "confirmed", "rejected"] as const;

export const observations = sqliteTable("observations", {
  // An INTEGER PRIMARY KEY (a rowid alias), not the UUID-text pattern used
  // elsewhere in this schema. This is required, not stylistic: FTS5
  // external-content tables sync via `content_rowid`, and an FTS5 rowid must
  // be an integer that matches the content table's rowid exactly. Every
  // other id in this file is a synthetic string primary key with no
  // relationship to SQLite's hidden rowid, which is incompatible with
  // external-content FTS5.
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Free-form (e.g. "convention", "pattern", "decision", "preference",
  // "warning") — only the relation vocabulary below is a locked set.
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  // Same topic_key = upsert in place (see saveInsight): the row updates and
  // `revision_count` increments, instead of accumulating duplicate rows for
  // an evolving pattern (e.g. "this month's take on a recurring bill").
  // Unique when present; multiple observations may have no topic_key at all
  // (SQLite unique indexes treat NULLs as distinct from one another).
  topicKey: text("topic_key"),
  // Hash of normalized content, used for dedup over a rolling window (see
  // saveInsight): a repeat save bumps duplicate_count/last_seen_at on the
  // existing row instead of inserting a new one.
  normalizedHash: text("normalized_hash").notNull(),
  revisionCount: integer("revision_count").notNull().default(1),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  // Soft delete only — see saveInsight/deleteInsight. A soft-deleted row is
  // excluded from search_insights/list_insights but never physically removed,
  // since this is the owner's learned financial history.
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const observationRelations = sqliteTable("observation_relations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sourceId: integer("source_id")
    .notNull()
    .references(() => observations.id, { onDelete: "cascade" }),
  targetId: integer("target_id")
    .notNull()
    .references(() => observations.id, { onDelete: "cascade" }),
  // Locked vocabulary — enforced in TypeScript via the `enum` here, and at
  // the DB boundary via a CHECK constraint added in the hand-written
  // migration (drizzle-kit's sqlite `text({enum})` is TS-only and does not
  // itself emit a CHECK constraint).
  relation: text("relation", { enum: relationTypes }).notNull(),
  reason: text("reason"),
  evidence: text("evidence"),
  // 0.0-1.0. Required by the application layer for a judged link (see
  // link_insights); nullable at the schema level for a future automatic
  // "pending" candidate that has not been judged yet.
  confidence: real("confidence"),
  judgmentStatus: text("judgment_status", { enum: judgmentStatuses }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const importedStatements = sqliteTable("imported_statements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bank: text("bank").notNull(),
  cardLastFour: text("card_last_four").notNull(),
  // YYYY-MM-DD, kept as plain text — never a native date/timestamp type.
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  statementDate: text("statement_date").notNull(),
  totalBilled: integer("total_billed").notNull(),
  transactionsImported: integer("transactions_imported").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
