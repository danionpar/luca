import { test } from "node:test";
import assert from "node:assert/strict";

import { runImport } from "./run-import.js";
import type { RunImportDeps } from "./run-import.js";
import { makeBalancedStatement, makeTransaction, makeUnbalancedStatement } from "./__fixtures__/synthetic-statements.js";
import type { ParsedStatement } from "../../parsers/statement-text-parser.js";
import type { PersistStatementParams } from "./db-deps.js";

interface FakeDepsOptions {
  files: Record<string, ParsedStatement | Error>;
  alreadyImportedStatementKeys?: Set<string>;
  alreadyImportedReferenceCodes?: Set<string>;
}

function makeFakeDeps(options: FakeDepsOptions) {
  const moves: { filePath: string; outcome: "processed" | "failed" }[] = [];
  const persisted: PersistStatementParams[] = [];

  const deps: RunImportDeps = {
    discoverPdfPaths: async () => Object.keys(options.files),
    parseStatement: async (pdfPath) => {
      const entry = options.files[pdfPath];
      if (entry instanceof Error) throw entry;
      return entry;
    },
    isStatementAlreadyImported: (identity) =>
      options.alreadyImportedStatementKeys?.has(`${identity.bank}:${identity.cardLastFour}:${identity.periodFrom}:${identity.periodTo}`) ?? false,
    isTransactionAlreadyImported: (referenceCode) => options.alreadyImportedReferenceCodes?.has(referenceCode) ?? false,
    persistImportedStatement: (params) => {
      persisted.push(params);
    },
    moveStatementFile: async (filePath, _rootFolder, outcome) => {
      moves.push({ filePath, outcome });
      return `/inbox/${outcome}/${filePath.split("/").pop()}`;
    },
  };

  return { deps, moves, persisted };
}

test("a dry run writes nothing to the database and moves no files, but reports what would happen", async () => {
  const statement = makeBalancedStatement();
  const { deps, moves, persisted } = makeFakeDeps({ files: { "/inbox/a.pdf": statement } });

  const summary = await runImport({ folderPath: "/inbox", dryRun: true, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.dryRun, true);
  assert.equal(summary.imported, 1);
  assert.equal(summary.transactionsImported, statement.transactions.length);
  assert.equal(persisted.length, 0, "dry run must not write to the database");
  assert.equal(moves.length, 0, "dry run must not move any file");
  assert.equal(summary.results[0].movedTo, null);
});

test("a real run persists the statement and moves the file into processed/", async () => {
  const statement = makeBalancedStatement();
  const { deps, moves, persisted } = makeFakeDeps({ files: { "/inbox/a.pdf": statement } });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.imported, 1);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].rows.length, statement.transactions.length);
  assert.deepEqual(moves, [{ filePath: "/inbox/a.pdf", outcome: "processed" }]);
});

test("a statement that fails reconciliation is refused, never persisted, and moved to failed/", async () => {
  const statement = makeUnbalancedStatement();
  const { deps, moves, persisted } = makeFakeDeps({ files: { "/inbox/bad.pdf": statement } });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.failed, 1);
  assert.equal(summary.imported, 0);
  assert.equal(persisted.length, 0);
  assert.deepEqual(moves, [{ filePath: "/inbox/bad.pdf", outcome: "failed" }]);
  assert.equal(summary.results[0].status, "failed_reconciliation");
  assert.ok(summary.results[0].reconciliation && summary.results[0].reconciliation.length > 0);
});

test("a PDF the parser cannot read at all is reported as failed_parse and moved to failed/, without blocking the rest of the batch", async () => {
  const goodStatement = makeBalancedStatement();
  const { deps, moves, persisted } = makeFakeDeps({
    files: {
      "/inbox/corrupt.pdf": new Error("could not extract text"),
      "/inbox/good.pdf": goodStatement,
    },
  });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.statementsFound, 2);
  assert.equal(summary.imported, 1);
  assert.equal(summary.failed, 1);
  assert.equal(persisted.length, 1, "the corrupt file must not block the good statement");

  const corruptResult = summary.results.find((r) => r.filePath === "/inbox/corrupt.pdf");
  assert.equal(corruptResult?.status, "failed_parse");
  assert.equal(corruptResult?.error, "could not extract text");
  assert.ok(moves.some((m) => m.filePath === "/inbox/corrupt.pdf" && m.outcome === "failed"));
});

test("a statement already imported in a previous run is skipped as a duplicate and filed into processed/", async () => {
  const statement = makeBalancedStatement();
  const key = `banco-chile:${statement.cardLastFour}:${statement.periodFrom}:${statement.periodTo}`;
  const { deps, moves, persisted } = makeFakeDeps({
    files: { "/inbox/a.pdf": statement },
    alreadyImportedStatementKeys: new Set([key]),
  });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.skippedDuplicate, 1);
  assert.equal(summary.imported, 0);
  assert.equal(persisted.length, 0);
  assert.deepEqual(moves, [{ filePath: "/inbox/a.pdf", outcome: "processed" }]);
});

test("a transaction already imported previously is skipped, and the count is reflected in the summary", async () => {
  const knownTx = makeTransaction({ referenceCode: "111111111111" });
  const newTx = makeTransaction({ referenceCode: "222222222222" });
  const statement = makeBalancedStatement({ transactions: [knownTx, newTx] });

  const { deps, persisted } = makeFakeDeps({
    files: { "/inbox/a.pdf": statement },
    alreadyImportedReferenceCodes: new Set(["111111111111"]),
  });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.equal(summary.transactionsImported, 1);
  assert.equal(summary.transactionsSkippedDuplicate, 1);
  assert.equal(persisted[0].rows.length, 1);
  assert.equal(persisted[0].rows[0].referenceCode, "222222222222");
});

test("statements are processed and persisted oldest-first even when discovered out of order", async () => {
  const march = makeBalancedStatement({ statementDate: "2025-03-25", periodFrom: "2025-03-01", periodTo: "2025-03-31" });
  const january = makeBalancedStatement({ statementDate: "2025-01-25", periodFrom: "2025-01-01", periodTo: "2025-01-31" });

  const { deps, persisted } = makeFakeDeps({
    files: {
      "/inbox/march.pdf": march,
      "/inbox/january.pdf": january,
    },
  });

  const summary = await runImport({ folderPath: "/inbox", dryRun: false, bank: "banco-chile", password: "" }, deps);

  assert.deepEqual(summary.results.map((r) => r.statementDate), ["2025-01-25", "2025-03-25"]);
  assert.deepEqual(
    persisted.map((p) => p.statementDate),
    ["2025-01-25", "2025-03-25"],
  );
});
