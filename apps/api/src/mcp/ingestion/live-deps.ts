import { parseBancoChileCreditCardStatement } from "../../parsers/banco-chile-credit-card.js";
import { isStatementAlreadyImported, isTransactionAlreadyImported, loadCategorizationRules, persistImportedStatement } from "./db-deps.js";
import { discoverPdfPaths, moveStatementFile } from "./fs-walk.js";
import type { RunImportDeps } from "./run-import.js";

/** Production wiring for `runImport`: real filesystem, real parser, real SQLite. */
export function createLiveImportDeps(): RunImportDeps {
  return {
    discoverPdfPaths,
    parseStatement: parseBancoChileCreditCardStatement,
    isStatementAlreadyImported,
    isTransactionAlreadyImported,
    persistImportedStatement,
    moveStatementFile,
    loadCategorizationRules,
  };
}
