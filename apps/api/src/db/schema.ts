import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  date,
} from "drizzle-orm/pg-core";

// Enums
export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "saving",
]);
export const transactionSourceEnum = pgEnum("transaction_source", [
  "email",
  "manual",
]);
export const categoryTypeEnum = pgEnum("category_type", [
  "income",
  "expense",
  "saving",
]);

// App tables
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  type: categoryTypeEnum("type").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  type: transactionTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  merchant: text("merchant"),
  description: text("description"),
  transactionDate: date("transaction_date").notNull(),
  source: transactionSourceEnum("source").notNull().default("manual"),
  bank: text("bank"),
  paymentMethod: text("payment_method"),
  rawEmailUid: text("raw_email_uid"),
  billingMonth: text("billing_month"), // YYYY-MM, the statement cycle this belongs to
  isProjected: boolean("is_projected").notNull().default(false),
  installmentCurrent: integer("installment_current"), // e.g. 3 of 6
  installmentTotal: integer("installment_total"), // e.g. 6
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const categorizationRules = pgTable("categorization_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  merchantPattern: text("merchant_pattern").notNull(),
  timesUsed: integer("times_used").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const importedStatements = pgTable("imported_statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  bank: text("bank").notNull(),
  cardLastFour: text("card_last_four").notNull(),
  periodFrom: date("period_from").notNull(),
  periodTo: date("period_to").notNull(),
  statementDate: date("statement_date").notNull(),
  totalBilled: integer("total_billed").notNull(),
  transactionsImported: integer("transactions_imported").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
