import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
