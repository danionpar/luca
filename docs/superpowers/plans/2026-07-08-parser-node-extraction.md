# Parser Node Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `qpdf` and `python3`/`pypdf` system dependencies from the Banco de Chile statement parser by extracting PDF text in pure Node, so statement import works reliably and the project can be installed without system prerequisites.

**Architecture:** The parser currently mixes two concerns in one file: PDF text extraction (shell-outs to `qpdf` and `python3`) and text-to-transaction parsing (pure string work). This plan splits them, puts the pure half under test first to lock in current behavior, then replaces the extraction half with `pdfjs-dist` — which is already a declared dependency, has a Node build, and supports password-protected PDFs natively.

**Tech Stack:** TypeScript 5.7 (ESM), Node 24, `pdfjs-dist` 4.9.155 (legacy build), `node:test` built-in test runner, `tsx` for TypeScript execution.

## Global Constraints

- All generated artifacts (code, comments, tests, docs, commit messages) are in **English**.
- The repository is **public**. No real bank statement, real merchant data, or real card number may be committed. All committed fixtures are synthetic.
- Conventional commits. No "Co-Authored-By" or AI attribution lines.
- Amounts are integers in Chilean pesos (CLP). No decimals, no float arithmetic on money.
- Do not change the parsing regexes or the `ParsedTransaction` / `ParsedStatement` shapes in this plan. Behavior must be preserved exactly; only the text-extraction mechanism changes.
- No new runtime dependency may be added. `pdfjs-dist` is already declared in `apps/api/package.json`.

## Context for the implementer

The file being changed is `apps/api/src/parsers/banco-chile-credit-card.ts` (171 lines). Read it before starting.

Its structure today:
- Lines 1–4: imports, including `execSync` from `child_process`.
- Lines 6–24: the exported `ParsedTransaction` and `ParsedStatement` interfaces.
- Lines 26–46: `extractText(pdfPath, password)` — shells out to `qpdf --decrypt` writing a temp file, then to `python3 -c` running a `pypdf` script. **This is the only part that touches the filesystem or spawns processes.**
- Lines 48–70: pure helpers (`parseDate`, `parseDateFull`, `parseAmount`) and three regexes.
- Lines 72–171: `parseBancoChileCreditCardStatement` — calls `extractText`, then walks the lines applying the regexes.

**Why this is being changed:** on the target machine `which python3` resolves to `/usr/bin/python3` (Apple's system interpreter), which does not have `pypdf` installed. Only `/opt/homebrew/bin/python3` has it. The parser therefore succeeds or fails depending on the PATH the process inherits.

**Two defects get fixed as a side effect**, and should not be reintroduced:
- `execSync` interpolates `password` directly into a shell command string (line 31) and `decryptedPath` into a Python source string (line 36). Both are injection vectors. Removing `execSync` removes them.
- The temp directory created by `mkdtempSync` (line 28) is never removed; only the file inside it is unlinked. Removing the shell-out removes the temp file entirely.

**The main technical risk:** `pypdf`'s `extract_text()` returns text already reconstructed into lines with horizontal spacing preserved. `pdfjs-dist` does not — `getTextContent()` returns an array of positioned text items and the caller must group them into lines. This matters because the regexes depend on layout: `SINGLE_RE` uses `\s{2,}` to separate the merchant from the city. Task 3 therefore reconstructs lines from item coordinates, and Task 2 captures the current output as the reference to match.

---

### Task 1: Extract the pure parser and lock its behavior with tests

Split the text-parsing logic into its own module and cover it with tests **before** touching extraction. This is the safety net for Tasks 3 and 4.

**Files:**
- Create: `apps/api/src/parsers/statement-text-parser.ts`
- Create: `apps/api/src/parsers/__fixtures__/synthetic-statement.txt`
- Create: `apps/api/src/parsers/statement-text-parser.test.ts`
- Modify: `apps/api/src/parsers/banco-chile-credit-card.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseStatementText(text: string): ParsedStatement` — the pure parser, exported from `statement-text-parser.ts`.
  - `ParsedTransaction` and `ParsedStatement` interfaces, re-exported from `statement-text-parser.ts` (they move here from `banco-chile-credit-card.ts`).
  - npm script `test` in `apps/api/package.json`.

- [ ] **Step 1: Add the test script to `apps/api/package.json`**

There is no test runner in this repository yet. Node 24 ships one, so no dependency is needed. Add to the `scripts` block:

```json
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "test:watch": "node --import tsx --test --watch \"src/**/*.test.ts\""
```

- [ ] **Step 2: Create the synthetic fixture**

This fixture is committed to a public repository, so every value in it is invented. It reproduces the *shape* of a Banco de Chile statement: a header block, a payments/purchases section, an installments section, and a charges section.

Create `apps/api/src/parsers/__fixtures__/synthetic-statement.txt` with exactly this content:

```
BANCO EJEMPLO
TARJETA DE CRÉDITO VISA 4321
FECHA ESTADO DE CUENTA 25/03/2025
PERÍODO FACTURADO 01/03/2025 31/03/2025
MONTO TOTAL FACTURADO A PAGAR $ 250.000
LUGAR DE OPERACIÓN FECHA CÓDIGO DESCRIPCIÓN CIUDAD MONTO
Pago Pesos TEF
SANTIAGO 15/03/25 123456789012 TIENDA EJEMPLO UNO  SANTIAGO $ 45.990 $ 45.990 01/01 $ 45.990
SANTIAGO 16/03/25 123456789013 TIENDA EJEMPLO DOS  PROVIDENCIA $ 12.500 $ 12.500 01/01 $ 12.500
TOTAL TRANSACCIONES EN UNA CUOTA $ 58.490
SANTIAGO 10/02/25 987654321098 TIENDA EJEMPLO TRES TASA INT. 2,45 % $ 120.000 $ 20.000 03/06 $ 20.000
TOTAL TRANSACCIONES EN CUOTAS $ 20.000
CARGOS, COMISIONES, IMPUESTOS Y ABONOS
05/03/25 111222333444 COMISION EJEMPLO $ 5.900 $ 5.900 01/01 $ 5.900
20/03/25 555666777888 ABONO EJEMPLO $ -30.000 $ -30.000 01/01 $ -30.000
ESTADO DE CUENTA INTERNACIONAL
SANTIAGO 22/03/25 999888777666 NO DEBE APARECER  SANTIAGO $ 99.999 $ 99.999 01/01 $ 99.999
```

The last line exists to prove the parser stops at the international-statement marker.

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/parsers/statement-text-parser.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseStatementText } from "./statement-text-parser.ts";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "synthetic-statement.txt"),
  "utf-8",
);

test("reads the statement header", () => {
  const result = parseStatementText(fixture);

  assert.equal(result.cardLastFour, "4321");
  assert.equal(result.statementDate, "2025-03-25");
  assert.equal(result.periodFrom, "2025-03-01");
  assert.equal(result.periodTo, "2025-03-31");
  assert.equal(result.totalBilled, 250000);
});

test("parses single-payment purchases", () => {
  const result = parseStatementText(fixture);
  const single = result.transactions.find((t) => t.referenceCode === "123456789012");

  assert.ok(single, "expected the first purchase to be parsed");
  assert.equal(single.date, "2025-03-15");
  assert.equal(single.merchant, "TIENDA EJEMPLO UNO");
  assert.equal(single.location, "SANTIAGO");
  assert.equal(single.amount, 45990);
  assert.equal(single.section, "single");
  assert.equal(single.interestRate, null);
});

test("parses installment purchases with their interest rate", () => {
  const result = parseStatementText(fixture);
  const installment = result.transactions.find((t) => t.referenceCode === "987654321098");

  assert.ok(installment, "expected the installment purchase to be parsed");
  assert.equal(installment.section, "installment");
  assert.equal(installment.interestRate, 2.45);
  assert.equal(installment.installment, "03/06");
  assert.equal(installment.amount, 20000);
});

test("parses charges and classifies negative amounts as payments", () => {
  const result = parseStatementText(fixture);

  const charge = result.transactions.find((t) => t.referenceCode === "111222333444");
  assert.ok(charge, "expected the commission charge to be parsed");
  assert.equal(charge.section, "charge");
  assert.equal(charge.amount, 5900);

  const credit = result.transactions.find((t) => t.referenceCode === "555666777888");
  assert.ok(credit, "expected the credit line to be parsed");
  assert.equal(credit.section, "payment");
  assert.equal(credit.amount, -30000);
});

test("stops at the international statement section", () => {
  const result = parseStatementText(fixture);

  assert.equal(
    result.transactions.find((t) => t.referenceCode === "999888777666"),
    undefined,
    "transactions after the international marker must be ignored",
  );
});

test("ignores transaction lines that appear before any section marker", () => {
  const result = parseStatementText(
    "SANTIAGO 15/03/25 123456789012 TIENDA  SANTIAGO $ 1.000 $ 1.000 01/01 $ 1.000",
  );

  assert.equal(
    result.transactions.length,
    0,
    "the parser starts in the 'pre' section and must ignore rows until a section begins",
  );
});

test("expands two-digit years into the 2000s", () => {
  const result = parseStatementText(fixture);
  const dates = result.transactions.map((t) => t.date);

  assert.ok(dates.length > 0, "expected the fixture to yield transactions");
  for (const date of dates) {
    assert.match(date, /^20\d{2}-\d{2}-\d{2}$/, `expected an ISO date in the 2000s, got ${date}`);
  }
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/api && pnpm test`
Expected: FAIL — `Cannot find module './statement-text-parser.ts'`.

- [ ] **Step 5: Create `statement-text-parser.ts`**

Move the pure logic out of `banco-chile-credit-card.ts` unchanged. Copy lines 6–24 (the interfaces) and lines 48–70 (helpers and regexes) verbatim, then convert the body of `parseBancoChileCreditCardStatement` (lines 77–170) into a synchronous function that takes text instead of a path.

Create `apps/api/src/parsers/statement-text-parser.ts`:

```typescript
export interface ParsedTransaction {
  date: string;
  referenceCode: string;
  merchant: string;
  location: string;
  amount: number;
  installment: string | null;
  interestRate: number | null;
  section: "single" | "installment" | "charge" | "payment";
}

export interface ParsedStatement {
  cardLastFour: string;
  statementDate: string;
  periodFrom: string;
  periodTo: string;
  totalBilled: number;
  transactions: ParsedTransaction[];
}

function parseDate(dateStr: string): string {
  const [day, month, yearShort] = dateStr.split("/");
  const year = parseInt(yearShort) < 50 ? `20${yearShort}` : `19${yearShort}`;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseDateFull(dateStr: string): string {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
}

function parseAmount(raw: string): number {
  return parseInt(raw.replace(/\./g, "").replace(/\s/g, "").replace(/,/g, ""), 10);
}

// Matches: LUGAR DD/MM/AA CÓDIGO COMERCIO CIUDAD $ MONTO $ MONTO CUOTA $ CUOTA
const SINGLE_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s{2,}(\S+.*?)\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

// Matches installment: has "TASA INT." in the line
const INSTALLMENT_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s+TASA\s+INT[.\s]+([\d,]+)\s*%\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

// Matches payment/charge without location prefix: DD/MM/AA CÓDIGO DESC $ MONTO ...
const CHARGE_RE = /^\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

/**
 * Parses the plain text of a Banco de Chile credit card statement.
 *
 * Layout-sensitive: SINGLE_RE relies on two or more spaces separating the
 * merchant from the city, so any text extractor feeding this function must
 * preserve horizontal gaps between columns.
 */
export function parseStatementText(text: string): ParsedStatement {
  const lines = text.split("\n");

  const transactions: ParsedTransaction[] = [];
  let cardLastFour = "";
  let statementDate = "";
  let periodFrom = "";
  let periodTo = "";
  let totalBilled = 0;
  let currentSection = "pre";

  for (const line of lines) {
    // Header
    if (!cardLastFour) {
      const m = line.match(/(\d{4})\s*$/);
      if (line.includes("TARJETA DE CR") && m) cardLastFour = m[1];
    }
    if (line.includes("FECHA ESTADO DE CUENTA")) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (m) statementDate = parseDateFull(m[1]);
    }
    if (!periodFrom) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
      if (m) { periodFrom = parseDateFull(m[1]); periodTo = parseDateFull(m[2]); }
    }
    if (line.includes("MONTO TOTAL FACTURADO A PAGAR")) {
      const m = line.match(/\$\s+([\d.]+)/);
      if (m) totalBilled = parseAmount(m[1]);
    }

    // Section tracking
    if (line.includes("Pago Pesos TEF") || line.includes("TOTAL PAGOS")) currentSection = "single";
    if (line.includes("TOTAL PAT A LA CUENTA") || line.includes("TOTAL TRANSACCIONES EN UNA CUOTA")) currentSection = "installments_section";
    if (line.includes("TOTAL TRANSACCIONES EN CUOTAS")) currentSection = "charges_section";
    if (line.includes("CARGOS, COMISIONES, IMPUESTOS")) currentSection = "charges";
    if (line.includes("INFORMACIÓN COMPRAS EN CUOTAS EN PERÍODO")) currentSection = "future";
    if (line.includes("ESTADO DE CUENTA INTERNACIONAL")) break;

    // Skip non-data lines
    if (line.includes("TOTAL ") || line.includes("LUGAR DE") || line.includes("Sin Movimientos")) continue;
    if (currentSection === "pre" || currentSection === "future") continue;

    // Try installment first
    if (line.includes("TASA INT")) {
      const m = line.match(INSTALLMENT_RE);
      if (m) {
        transactions.push({
          date: parseDate(m[2]),
          referenceCode: m[3],
          merchant: m[4].trim(),
          location: m[1].trim(),
          amount: parseAmount(m[9]),
          installment: m[8],
          interestRate: parseFloat(m[5].replace(",", ".")),
          section: "installment",
        });
        continue;
      }
    }

    // Try single purchase
    const sm = line.match(SINGLE_RE);
    if (sm) {
      const amt = parseAmount(sm[9]);
      transactions.push({
        date: parseDate(sm[2]),
        referenceCode: sm[3],
        merchant: sm[4].trim(),
        location: sm[1].trim(),
        amount: amt,
        installment: sm[8],
        interestRate: null,
        section: amt < 0 ? "payment" : (currentSection === "charges" ? "charge" : "single"),
      });
      continue;
    }

    // Try charge/payment line
    const cm = line.match(CHARGE_RE);
    if (cm) {
      const amt = parseAmount(cm[7]);
      transactions.push({
        date: parseDate(cm[1]),
        referenceCode: cm[2],
        merchant: cm[3].trim(),
        location: "",
        amount: amt,
        installment: cm[6],
        interestRate: null,
        section: amt < 0 ? "payment" : "charge",
      });
    }
  }

  return { cardLastFour, statementDate, periodFrom, periodTo, totalBilled, transactions };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pnpm test`
Expected: PASS — 6 tests passing.

If the header test fails on `periodFrom`, check that the fixture's `PERÍODO FACTURADO` line is the first line containing two full `DD/MM/YYYY` dates.

- [ ] **Step 7: Make `banco-chile-credit-card.ts` delegate to the new module**

Replace the whole file with a version that keeps `extractText` as-is for now and delegates parsing. The extraction rewrite happens in Task 3.

```typescript
import { execSync } from "child_process";
import { unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { parseStatementText } from "./statement-text-parser.ts";
import type { ParsedStatement, ParsedTransaction } from "./statement-text-parser.ts";

export type { ParsedStatement, ParsedTransaction };

async function extractText(pdfPath: string, password: string): Promise<string> {
  // Decrypt with qpdf
  const tmpDir = mkdtempSync(join(tmpdir(), "cartola-"));
  const decryptedPath = join(tmpDir, "decrypted.pdf");
  try {
    execSync(`qpdf --password=${password} --decrypt "${pdfPath}" "${decryptedPath}"`, { stdio: "pipe" });

    // Extract text with python (already proven to work)
    const script = `
from pypdf import PdfReader
reader = PdfReader("${decryptedPath}")
for page in reader.pages:
    print(page.extract_text())
    print("---PAGE_BREAK---")
`;
    const text = execSync(`python3 -c '${script}'`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return text;
  } finally {
    try { unlinkSync(decryptedPath); } catch {}
  }
}

export async function parseBancoChileCreditCardStatement(
  pdfPath: string,
  password: string
): Promise<ParsedStatement> {
  const text = await extractText(pdfPath, password);
  return parseStatementText(text);
}
```

- [ ] **Step 8: Verify nothing else broke**

Run: `cd apps/api && pnpm build`
Expected: no TypeScript errors. `src/routes/statements.ts` imports `parseBancoChileCreditCardStatement` and the re-exported types, and its import continues to resolve.

Run: `cd apps/api && pnpm test`
Expected: PASS — 6 tests passing.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/parsers/statement-text-parser.ts \
        apps/api/src/parsers/statement-text-parser.test.ts \
        apps/api/src/parsers/__fixtures__/synthetic-statement.txt \
        apps/api/src/parsers/banco-chile-credit-card.ts \
        apps/api/package.json
git commit -m "refactor(parser): split statement text parsing from PDF extraction

Extract the pure text-to-transactions logic into its own module and cover it
with tests against a synthetic fixture. This locks in current behavior before
the PDF extraction mechanism is replaced."
```

---

### Task 2: Capture reference text from a real statement

The Node extractor must produce text the existing regexes still match. This task captures what the current Python path produces, as the target to match. It is a local-only step: the output contains real financial data and must never be committed.

**Files:**
- Create: `apps/api/scripts/capture-reference-text.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `extractText` behavior from the current `banco-chile-credit-card.ts` (Task 1 left it intact).
- Produces: a local file `apps/api/.local/reference-text.txt` used as the comparison target in Task 3. Not committed.

- [ ] **Step 1: Add the local output directory to `.gitignore`**

Append to `<repo-root>/.gitignore`:

```
# Local-only reference output from real statements — never committed
.local/
```

- [ ] **Step 2: Write the capture script**

This script deliberately calls Homebrew's Python by absolute path rather than bare `python3`, because the system interpreter lacks `pypdf`. It exists only to produce the reference file and is deleted in Task 4.

Create `apps/api/scripts/capture-reference-text.ts`:

```typescript
/**
 * One-off: dumps the text the current Python-based extractor produces for a
 * real statement, to serve as the reference the Node extractor must match.
 *
 * Usage: pnpm tsx scripts/capture-reference-text.ts <pdf-path> <password>
 *
 * Output goes to .local/reference-text.txt, which is git-ignored. The output
 * contains real financial data — do not commit it.
 */
import { execSync } from "node:child_process";
import { mkdirSync, unlinkSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HOMEBREW_PYTHON = "/opt/homebrew/bin/python3";

const [pdfPath, password] = process.argv.slice(2);

if (!pdfPath || !password) {
  console.error("Usage: pnpm tsx scripts/capture-reference-text.ts <pdf-path> <password>");
  process.exit(1);
}

const tmpDir = mkdtempSync(join(tmpdir(), "reference-"));
const decryptedPath = join(tmpDir, "decrypted.pdf");

try {
  execSync(`qpdf --password=${password} --decrypt "${pdfPath}" "${decryptedPath}"`, { stdio: "pipe" });

  const script = `
from pypdf import PdfReader
reader = PdfReader("${decryptedPath}")
for page in reader.pages:
    print(page.extract_text())
    print("---PAGE_BREAK---")
`;
  const text = execSync(`${HOMEBREW_PYTHON} -c '${script}'`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/reference-text.txt", text, "utf-8");

  console.log(`Wrote .local/reference-text.txt (${text.length} chars, ${text.split("\n").length} lines)`);
} finally {
  try { unlinkSync(decryptedPath); } catch {}
}
```

- [ ] **Step 3: Run it against a real statement**

Run: `cd apps/api && pnpm tsx scripts/capture-reference-text.ts /path/to/a/real/statement.pdf <password>`
Expected: prints the character and line count, and creates `apps/api/.local/reference-text.txt`.

If `qpdf` is not found, install it with `brew install qpdf`. If the Python step fails, confirm `pypdf` is present with `/opt/homebrew/bin/python3 -c "import pypdf"`.

- [ ] **Step 4: Confirm the reference text parses correctly**

Run: `cd apps/api && node --import tsx -e "import {readFileSync} from 'node:fs'; import {parseStatementText} from './src/parsers/statement-text-parser.ts'; const r = parseStatementText(readFileSync('.local/reference-text.txt','utf-8')); console.log({card: r.cardLastFour, from: r.periodFrom, to: r.periodTo, total: r.totalBilled, count: r.transactions.length});"`

Expected: a card number, a period, a non-zero total, and a transaction count matching the real statement. **Write these numbers down** — Task 3 must reproduce them exactly.

- [ ] **Step 5: Verify the reference file is not tracked by git**

Run: `git status --porcelain apps/api/.local/`
Expected: no output. If the file appears, the `.gitignore` entry from Step 1 is wrong — fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add .gitignore apps/api/scripts/capture-reference-text.ts
git commit -m "chore(parser): add one-off script to capture reference extraction output"
```

---

### Task 3: Extract PDF text in Node with pdfjs-dist

**Files:**
- Create: `apps/api/src/types/pdfjs-dist.d.ts`
- Create: `apps/api/src/parsers/pdf-text.ts`
- Create: `apps/api/src/parsers/pdf-text.test.ts`

**Interfaces:**
- Consumes: `parseStatementText` from Task 1 (used in the comparison test).
- Produces: `extractPdfText(pdfPath: string, password: string): Promise<string>` — exported from `pdf-text.ts`. Returns page text joined by `---PAGE_BREAK---` lines, matching the current format.

**Before writing code, know this** (verified against the installed `pdfjs-dist@4.9.155`, and the reason Step 1 below exists):

- The package has **no `exports` map**, and its `types` field points only at `types/src/pdf.d.ts`. TypeScript therefore finds no declarations for the subpath `pdfjs-dist/legacy/build/pdf.mjs`, and importing from it without help fails to compile.
- `TextItem` is **not** among the exported types. Do not try to import it — the item shape is declared locally instead.
- The legacy build is the one that runs under Node; the default build targets browsers.

- [ ] **Step 1: Declare the types for the legacy build**

Without this the next steps do not compile, for the reasons listed above. Declare only the surface actually used.

Create `apps/api/src/types/pdfjs-dist.d.ts`:

```typescript
/**
 * Minimal type declarations for the pdfjs-dist Node (legacy) build.
 *
 * pdfjs-dist 4.9.155 ships no `exports` map and its `types` field covers only
 * the bare entry point, so this subpath has no declarations of its own. Only
 * the members this project uses are declared here.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfTextItem {
    str: string;
    /** [scaleX, skewX, skewY, scaleY, translateX, translateY] — x is [4], y is [5]. */
    transform: number[];
    width: number;
    height: number;
    hasEOL: boolean;
  }

  export interface PdfTextContent {
    items: Array<PdfTextItem | { type: string }>;
  }

  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>;
    cleanup(): void;
  }

  export interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
  }

  export interface GetDocumentParameters {
    data?: Uint8Array;
    password?: string;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    useWorkerFetch?: boolean;
    isEvalSupported?: boolean;
  }

  export function getDocument(src: GetDocumentParameters): { promise: Promise<PdfDocumentProxy> };
}
```

- [ ] **Step 2: Write the failing test**

This test is conditional: it runs only when `.local/reference-text.txt` and a real statement are available, and skips otherwise so CI and fresh clones stay green. The environment variables point at the local statement.

Create `apps/api/src/parsers/pdf-text.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && pnpm test`
Expected: FAIL — `Cannot find module './pdf-text.ts'`.

- [ ] **Step 4: Implement the extractor**

`pdfjs-dist` returns positioned text items, not lines. This implementation groups items into lines by their vertical position, orders each line left to right, and inserts spacing proportional to the horizontal gap — which is what keeps `SINGLE_RE`'s `\s{2,}` merchant/city separator working.

Create `apps/api/src/parsers/pdf-text.ts`:

```typescript
import { readFile } from "node:fs/promises";

// The legacy build is the one that runs under Node; the default build targets
// browsers. Its types come from src/types/pdfjs-dist.d.ts.
import { getDocument, type PdfTextItem } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Vertical distance in PDF units below which two items are treated as the same line. */
const LINE_TOLERANCE = 2;

/** Horizontal gap, in multiples of the estimated character width, that becomes a column break. */
const COLUMN_GAP_RATIO = 1.5;

/** Upper bound on inserted spaces, so a wide empty column cannot produce a huge run. */
const MAX_GAP_SPACES = 12;

interface PositionedItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof (item as PdfTextItem)?.str === "string";
}

/**
 * Rebuilds a line of text from items ordered left to right, inserting spaces
 * proportional to the horizontal gap between them so column structure survives.
 */
function joinLine(items: PositionedItem[]): string {
  let line = "";
  let cursor: number | null = null;

  for (const item of items) {
    if (cursor !== null) {
      const gap = item.x - cursor;
      const charWidth = item.width > 0 && item.text.length > 0 ? item.width / item.text.length : 0;

      if (charWidth > 0 && gap > charWidth * COLUMN_GAP_RATIO) {
        const spaces = Math.min(Math.round(gap / charWidth), MAX_GAP_SPACES);
        line += " ".repeat(Math.max(spaces, 2));
      } else if (gap > 0 && !line.endsWith(" ")) {
        line += " ";
      }
    }

    line += item.text;
    cursor = item.x + item.width;
  }

  return line.trimEnd();
}

/** Groups items into lines by vertical position, top to bottom. */
function groupIntoLines(items: PositionedItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    const sameLine = current && Math.abs(current[0].y - item.y) <= LINE_TOLERANCE;

    if (sameLine) current.push(item);
    else lines.push([item]);
  }

  return lines.map((line) => joinLine([...line].sort((a, b) => a.x - b.x)));
}

/**
 * Extracts the text of a password-protected PDF using pdfjs-dist, with no
 * system dependencies. Pages are separated by a ---PAGE_BREAK--- line, matching
 * the format the statement parser expects.
 */
export async function extractPdfText(pdfPath: string, password: string): Promise<string> {
  const data = new Uint8Array(await readFile(pdfPath));

  const document = await getDocument({
    data,
    password,
    // Text extraction needs neither fonts nor a worker thread.
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      const items: PositionedItem[] = content.items.filter(isTextItem).map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      }));

      pages.push(groupIntoLines(items).join("\n"));
      page.cleanup();
    }

    return `${pages.join("\n---PAGE_BREAK---\n")}\n---PAGE_BREAK---\n`;
  } finally {
    await document.destroy();
  }
}
```

- [ ] **Step 5: Run the test**

Run: `cd apps/api && REFERENCE_PDF_PATH=/path/to/statement.pdf REFERENCE_PDF_PASSWORD=<password> pnpm test`
Expected: PASS.

**If the transaction count does not match**, the line reconstruction is off. Diagnose by dumping both texts side by side:

```bash
cd apps/api
node --import tsx -e "import {extractPdfText} from './src/parsers/pdf-text.ts'; console.log(await extractPdfText(process.env.REFERENCE_PDF_PATH, process.env.REFERENCE_PDF_PASSWORD))" > .local/node-text.txt
diff <(head -60 .local/reference-text.txt) <(head -60 .local/node-text.txt)
```

Tune in this order: `LINE_TOLERANCE` first if rows are merging or splitting, then `COLUMN_GAP_RATIO` if the merchant and city are running together (`SINGLE_RE` needs two or more spaces there).

- [ ] **Step 6: Confirm the skip path works on a fresh clone**

Run: `cd apps/api && pnpm test`
Expected: PASS, with the two `pdf-text` tests reported as skipped. This proves the suite stays green without a real statement.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types/pdfjs-dist.d.ts apps/api/src/parsers/pdf-text.ts apps/api/src/parsers/pdf-text.test.ts
git commit -m "feat(parser): extract PDF text in Node with pdfjs-dist

Replaces the need to shell out to qpdf and python3/pypdf. Rebuilds lines from
positioned text items so the column spacing the statement regexes depend on
is preserved."
```

---

### Task 4: Remove the Python and qpdf dependencies

**Files:**
- Modify: `apps/api/src/parsers/banco-chile-credit-card.ts`
- Delete: `apps/api/scripts/capture-reference-text.ts`
- Modify: `apps/api/src/scripts/test-parser.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: `extractPdfText` from Task 3, `parseStatementText` from Task 1.
- Produces: `parseBancoChileCreditCardStatement(pdfPath, password)` unchanged in signature and return type — `apps/api/src/routes/statements.ts` continues to work untouched.

- [ ] **Step 1: Rewrite `banco-chile-credit-card.ts` with no shell-outs**

Replace the whole file:

```typescript
import { extractPdfText } from "./pdf-text.js";
import { parseStatementText } from "./statement-text-parser.js";
import type { ParsedStatement, ParsedTransaction } from "./statement-text-parser.js";

export type { ParsedStatement, ParsedTransaction };

/**
 * Parses a Banco de Chile credit card statement PDF.
 *
 * Pure Node: no qpdf, no python3, no temporary files.
 */
export async function parseBancoChileCreditCardStatement(
  pdfPath: string,
  password: string,
): Promise<ParsedStatement> {
  return parseStatementText(await extractPdfText(pdfPath, password));
}
```

- [ ] **Step 2: Verify no shell-out remains anywhere in the parser path**

Run: `grep -rn "execSync\|python3\|qpdf\|pypdf" apps/api/src/`
Expected: no output.

If `apps/api/src/scripts/test-parser.ts` appears, open it and replace any direct extraction call with `parseBancoChileCreditCardStatement`. It is a development script, so the only requirement is that it compiles and does not shell out.

- [ ] **Step 3: Delete the one-off capture script**

Its purpose ended with Task 3.

```bash
rm apps/api/scripts/capture-reference-text.ts
```

- [ ] **Step 4: Run the full check**

Run: `cd apps/api && pnpm build && REFERENCE_PDF_PATH=/path/to/statement.pdf REFERENCE_PDF_PASSWORD=<password> pnpm test`
Expected: build clean, all tests pass.

- [ ] **Step 5: Prove it works without Homebrew Python on PATH**

This is the whole point of the change — confirm it rather than assume it.

Run: `cd apps/api && env PATH=/usr/bin:/bin REFERENCE_PDF_PATH=/path/to/statement.pdf REFERENCE_PDF_PASSWORD=<password> node --import tsx --test "src/**/*.test.ts"`
Expected: PASS. Under this PATH, `qpdf` is absent and `python3` is the system interpreter without `pypdf` — the exact conditions that broke the old parser.

- [ ] **Step 6: Write the README**

Create `README.md` at the repository root. Statement import no longer has system prerequisites, and the README should say so plainly.

```markdown
# Budget POC

A personal finance tracker for Chilean bank statements. Runs entirely on your
own machine: your financial data never leaves it.

## Status

Early. The statement parser and data model work; the MCP server that turns this
into a conversational tool is being built. See
[docs/superpowers/specs/](docs/superpowers/specs/) for the architecture.

## Requirements

- Node 24 or newer
- pnpm 9

That's it. Statement parsing is pure Node — no Python, no qpdf, no system
libraries to install.

## Setup

```bash
pnpm install
```

## Running the tests

```bash
cd apps/api && pnpm test
```

Tests that need a real bank statement skip automatically. To run them, point at
one of your own:

```bash
REFERENCE_PDF_PATH=/path/to/statement.pdf REFERENCE_PDF_PASSWORD=your-password pnpm test
```

## Privacy

Real statements and the local database are git-ignored and must never be
committed. Every fixture in this repository is synthetic.
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/parsers/banco-chile-credit-card.ts apps/api/src/scripts/test-parser.ts README.md
git rm apps/api/scripts/capture-reference-text.ts
git commit -m "feat(parser): drop qpdf and python3 system dependencies

Statement parsing now runs in pure Node. This fixes imports failing when the
process inherits a PATH where python3 resolves to the system interpreter, which
has no pypdf, and removes the shell and code injection introduced by building
qpdf and python commands from interpolated strings."
```

---

## Verification

After all four tasks:

- `cd apps/api && pnpm build` — clean.
- `cd apps/api && pnpm test` — passes on a fresh clone with PDF tests skipped.
- With a real statement and a minimal PATH — passes, proving the system dependencies are gone.
- `grep -rn "execSync\|python3\|qpdf\|pypdf" apps/api/src/` — no output.
- `git status --porcelain` — no `.local/`, no `.pdf`, no `.db` files staged.

## What this plan does not cover

Each of these gets its own plan, in this order:

1. Local SQLite migration and removal of the HTTP/auth layer.
2. The MCP server and its core tools.
3. Backfilling historical statements.
4. The insight layer.
5. The Artifact house style.
6. One-command setup and the public-facing README expansion.
