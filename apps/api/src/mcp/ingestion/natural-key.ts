/**
 * The natural key that identifies "this exact statement" independent of
 * filename: bank + card + billing period. Two PDFs with the same key are
 * the same statement (e.g. re-downloaded, or re-scanned into a different
 * folder) and only one may ever be imported.
 */
export interface StatementIdentity {
  bank: string;
  cardLastFour: string;
  periodFrom: string;
  periodTo: string;
}

export function buildStatementNaturalKey(identity: StatementIdentity): string {
  return `${identity.bank}:${identity.cardLastFour}:${identity.periodFrom}:${identity.periodTo}`;
}
