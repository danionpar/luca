import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categorizationRules, importedStatements, transactions } from "../../db/schema.js";
import type { MatchableRule } from "../categorization/rule-matching.js";
import type { NewTransactionRow } from "./map-transaction.js";
import type { StatementIdentity } from "./natural-key.js";

export function isStatementAlreadyImported(identity: StatementIdentity): boolean {
  const row = db
    .select({ id: importedStatements.id })
    .from(importedStatements)
    .where(
      and(
        eq(importedStatements.bank, identity.bank),
        eq(importedStatements.cardLastFour, identity.cardLastFour),
        eq(importedStatements.periodFrom, identity.periodFrom),
        eq(importedStatements.periodTo, identity.periodTo),
      ),
    )
    .get();
  return row !== undefined;
}

export function isTransactionAlreadyImported(referenceCode: string): boolean {
  const row = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.referenceCode, referenceCode)).get();
  return row !== undefined;
}

/** Loads every stored categorization rule for `planImport` to apply to newly-mapped rows. */
export function loadCategorizationRules(): MatchableRule[] {
  return db
    .select({ id: categorizationRules.id, categoryId: categorizationRules.categoryId, merchantPattern: categorizationRules.merchantPattern, createdAt: categorizationRules.createdAt })
    .from(categorizationRules)
    .all();
}

export interface PersistStatementParams extends StatementIdentity {
  statementDate: string;
  totalBilled: number;
  rows: NewTransactionRow[];
}

/**
 * Writes the imported-statement record and its transactions in a single
 * SQLite transaction: either the whole statement lands, or none of it does.
 */
export function persistImportedStatement(params: PersistStatementParams): void {
  db.transaction((tx) => {
    tx.insert(importedStatements)
      .values({
        bank: params.bank,
        cardLastFour: params.cardLastFour,
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        statementDate: params.statementDate,
        totalBilled: params.totalBilled,
        transactionsImported: params.rows.length,
      })
      .run();

    if (params.rows.length > 0) {
      tx.insert(transactions).values(params.rows).run();
    }
  });
}
