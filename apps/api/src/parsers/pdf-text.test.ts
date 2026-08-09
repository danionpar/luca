import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { extractPdfText } from "./pdf-text.js";
import { parseStatementText } from "./statement-text-parser.js";

const REFERENCE_PATH = ".local/reference-text.txt";
const pdfPath = process.env.REFERENCE_PDF_PATH;
const password = process.env.REFERENCE_PDF_PASSWORD;

const canRun = Boolean(pdfPath && password) && existsSync(REFERENCE_PATH);

test(
  "extracted text parses to the same statement as the reference text",
  { skip: canRun ? false : "set REFERENCE_PDF_PATH and REFERENCE_PDF_PASSWORD and run the capture script first" },
  async () => {
    const reference = parseStatementText(readFileSync(REFERENCE_PATH, "utf-8"));
    const extracted = parseStatementText(await extractPdfText(pdfPath!, password!));

    assert.equal(extracted.cardLastFour, reference.cardLastFour);
    assert.equal(extracted.statementDate, reference.statementDate);
    assert.equal(extracted.periodFrom, reference.periodFrom);
    assert.equal(extracted.periodTo, reference.periodTo);
    assert.equal(extracted.totalBilled, reference.totalBilled);
    assert.equal(
      extracted.transactions.length,
      reference.transactions.length,
      "transaction count must match the reference extraction",
    );
    assert.deepEqual(extracted.transactions, reference.transactions);
  },
);

test(
  "rejects a wrong password with a clear message",
  { skip: pdfPath ? false : "set REFERENCE_PDF_PATH" },
  async () => {
    await assert.rejects(
      () => extractPdfText(pdfPath!, "definitely-not-the-password"),
      /password/i,
      "a wrong password must produce an error mentioning the password",
    );
  },
);
