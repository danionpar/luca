export interface ParsedTransaction {
  date: string;
  referenceCode: string;
  merchant: string;
  location: string;
  amount: number;
  installment: string | null;
  interestRate: number | null;
  section: "single" | "installment" | "charge" | "payment" | "pat";
}

/**
 * A per-section arithmetic check: the sum of the transactions the parser
 * assigned to a section, against the total the statement itself prints for
 * that section. This is the parser's verification oracle — a statement
 * validates against its own printed arithmetic rather than against any
 * external reference implementation.
 *
 * `printedTotal` is `null` when the statement does not print that marker at
 * all (e.g. no PAT region). A `null` printedTotal always makes `balances`
 * false — absence of a total is never treated as a total of zero.
 */
export interface SectionReconciliation {
  section: "payment" | "pat" | "single" | "installment";
  parsedSum: number;
  printedTotal: number | null;
  delta: number | null;
  balances: boolean;
}

export interface ReconciliationResult {
  balanced: boolean;
  checks: SectionReconciliation[];
}

export interface ParsedStatement {
  cardLastFour: string;
  statementDate: string;
  periodFrom: string;
  periodTo: string;
  totalBilled: number;
  transactions: ParsedTransaction[];
  reconciliation: ReconciliationResult;
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

/**
 * Collapses any run of whitespace to a single space and trims the ends.
 * Different text extractors reconstruct a PDF's column gaps with different
 * internal spacing (an artifact of each extractor's own layout heuristic,
 * not a meaningful distinction), so merchant/location identity must not
 * depend on exactly how many spaces separate two words.
 */
function normalizeWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// Matches: LUGAR DD/MM/AA CÓDIGO COMERCIO CIUDAD $ MONTO $ MONTO CUOTA $ CUOTA
const SINGLE_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s{2,}(\S+.*?)\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

// Fallback for rows where the extractor could not recover the merchant/city
// boundary (pdf.js sometimes merges reference code, merchant and city into
// one text item with uniform single spaces, so no \s{2,} exists anywhere in
// the line). Identical to SINGLE_RE except merchant and city are captured
// together as one field rather than split. Dropping a real transaction over
// an unrecoverable cosmetic field boundary is worse than keeping it with a
// merged merchant/city string, so this is tried only after SINGLE_RE fails.
const SINGLE_MERGED_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

// Matches installment: has "TASA INT." in the line
const INSTALLMENT_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s+TASA\s+INT[.\s]+([\d,]+)\s*%\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

// Matches payment/charge without location prefix: DD/MM/AA CÓDIGO DESC $ MONTO ...
const CHARGE_RE = /^\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{9,18})\s+(.+?)\s+\$\s+([-\d.]+)\s+\$\s+([-\d.]+)\s+(\d{2}\/\d{2})\s+\$\s+([-\d.]+)/;

/**
 * Region the current line falls in, tracked as we walk the statement
 * top-to-bottom. Each `TOTAL ...` marker line is the END of the region it
 * names and therefore advances `currentRegion` to the region that FOLLOWS
 * it — not the one it summarizes. The real layout is:
 *
 *   payments      -- up to "TOTAL PAGOS"
 *   pat           -- between "TOTAL PAGOS" and "TOTAL PAT A LA CUENTA"
 *   single        -- between "TOTAL PAT A LA CUENTA" and "TOTAL TRANSACCIONES EN UNA CUOTA"
 *   installments  -- between "TOTAL TRANSACCIONES EN UNA CUOTA" and "TOTAL TRANSACCIONES EN CUOTAS"
 *   charges       -- after "CARGOS, COMISIONES, IMPUESTOS"
 *
 * `between_cuotas_and_charges` and `pre` carry no rows of their own; they
 * only exist so unmatched lines between two markers are inert.
 */
type Region =
  | "pre"
  | "payments"
  | "pat"
  | "single"
  | "installments"
  | "between_cuotas_and_charges"
  | "charges"
  | "future";

/**
 * Maps the current region to the section every row in it gets. Section is a
 * function of region alone — the amount's sign carries no section
 * information: a refund is a charge line with a negative amount, and a
 * credit adjustment inside the singles region is still a single. Only the
 * payments region ever yields "payment".
 */
function sectionForRegion(region: Region): ParsedTransaction["section"] {
  if (region === "payments") return "payment";
  if (region === "pat") return "pat";
  if (region === "charges") return "charge";
  return "single";
}

/** Extracts the peso amount from a `... $ 1.234` style total line. */
function printedAmount(line: string): number | null {
  const m = line.match(/\$\s*([-\d.]+)/);
  return m ? parseAmount(m[1]) : null;
}

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
  let currentRegion: Region = "pre";

  // Printed totals, parsed from the same marker lines used for region
  // tracking. `null` means the statement never printed that marker.
  let printedPayments: number | null = null;
  let printedPat: number | null = null;
  let printedSingle: number | null = null;
  let printedInstallment: number | null = null;

  // Indices of transactions tentatively tagged "pat" while currentRegion is
  // "pat". If some other marker arrives before "TOTAL PAT A LA CUENTA"
  // confirms them (i.e. the statement has no PAT rows and skips straight
  // from "TOTAL PAGOS" to the single-purchase listing without printing that
  // marker), they get demoted to "single" instead of staying mistagged.
  let pendingPatIndices: number[] = [];

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

    // Printed section totals (captured before the marker also flips the region below).
    if (line.includes("TOTAL PAGOS") && printedPayments === null) printedPayments = printedAmount(line);
    if (line.includes("TOTAL PAT A LA CUENTA") && printedPat === null) printedPat = printedAmount(line);
    if (line.includes("TOTAL TRANSACCIONES EN UNA CUOTA") && printedSingle === null) printedSingle = printedAmount(line);
    if (line.includes("TOTAL TRANSACCIONES EN CUOTAS") && printedInstallment === null) printedInstallment = printedAmount(line);

    // Region tracking: each marker is the END of the region it names, so it
    // advances currentRegion to the region that follows it.
    const isRegionMarker =
      line.includes("1.TOTAL OPERACIONES") ||
      line.includes("Pago Pesos TEF") ||
      line.includes("TOTAL PAGOS") ||
      line.includes("TOTAL PAT A LA CUENTA") ||
      line.includes("TOTAL TRANSACCIONES EN UNA CUOTA") ||
      line.includes("TOTAL TRANSACCIONES EN CUOTAS") ||
      line.includes("CARGOS, COMISIONES, IMPUESTOS") ||
      line.includes("INFORMACIÓN COMPRAS EN CUOTAS EN PERÍODO") ||
      line.includes("ESTADO DE CUENTA INTERNACIONAL");

    // Any other marker arriving while still "pat" means "TOTAL PAT A LA
    // CUENTA" never printed — demote the rows tentatively tagged "pat".
    if (currentRegion === "pat" && isRegionMarker && !line.includes("TOTAL PAT A LA CUENTA")) {
      for (const idx of pendingPatIndices) transactions[idx].section = "single";
      pendingPatIndices = [];
    }

    // "1.TOTAL OPERACIONES" is the statement's own section header, printed
    // once, immediately before the transaction listing begins — a
    // structural marker present in every statement regardless of which
    // payment method the first payment row happens to describe.
    // "Pago Pesos TEF" is kept as a second, narrower trigger: it is not a
    // section header at all but the description text Banco de Chile prints
    // on an electronic-transfer payment row, which historically doubled as
    // the de facto region marker. Some statements instead describe their
    // payment rows as e.g. "MONTO CANCELADO", so relying on that text alone
    // left the payments/PAT region never entered and those rows silently
    // dropped (see the "MONTO CANCELADO" regression).
    if (line.includes("1.TOTAL OPERACIONES") || line.includes("Pago Pesos TEF")) currentRegion = "payments";
    if (line.includes("TOTAL PAGOS")) currentRegion = "pat";
    if (line.includes("TOTAL PAT A LA CUENTA")) { currentRegion = "single"; pendingPatIndices = []; }
    if (line.includes("TOTAL TRANSACCIONES EN UNA CUOTA")) currentRegion = "installments";
    if (line.includes("TOTAL TRANSACCIONES EN CUOTAS")) currentRegion = "between_cuotas_and_charges";
    if (line.includes("CARGOS, COMISIONES, IMPUESTOS")) currentRegion = "charges";
    if (line.includes("INFORMACIÓN COMPRAS EN CUOTAS EN PERÍODO")) currentRegion = "future";
    if (line.includes("ESTADO DE CUENTA INTERNACIONAL")) break;

    // Skip non-data lines
    if (line.includes("TOTAL ") || line.includes("LUGAR DE") || line.includes("Sin Movimientos")) continue;
    if (currentRegion === "pre" || currentRegion === "future") continue;

    // Try installment first
    if (line.includes("TASA INT")) {
      const m = line.match(INSTALLMENT_RE);
      if (m) {
        transactions.push({
          date: parseDate(m[2]),
          referenceCode: m[3],
          merchant: normalizeWhitespace(m[4]),
          location: normalizeWhitespace(m[1]),
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
        merchant: normalizeWhitespace(sm[4]),
        location: normalizeWhitespace(sm[1]),
        amount: amt,
        installment: sm[8],
        interestRate: null,
        section: sectionForRegion(currentRegion),
      });
      if (currentRegion === "pat") pendingPatIndices.push(transactions.length - 1);
      continue;
    }

    // Fall back to a merged merchant/city capture when SINGLE_RE could not
    // find a two-or-more-space boundary between them.
    const smm = line.match(SINGLE_MERGED_RE);
    if (smm) {
      const amt = parseAmount(smm[8]);
      transactions.push({
        date: parseDate(smm[2]),
        referenceCode: smm[3],
        merchant: normalizeWhitespace(smm[4]),
        location: normalizeWhitespace(smm[1]),
        amount: amt,
        installment: smm[7],
        interestRate: null,
        section: sectionForRegion(currentRegion),
      });
      if (currentRegion === "pat") pendingPatIndices.push(transactions.length - 1);
      continue;
    }

    // Try charge/payment line
    const cm = line.match(CHARGE_RE);
    if (cm) {
      transactions.push({
        date: parseDate(cm[1]),
        referenceCode: cm[2],
        merchant: normalizeWhitespace(cm[3]),
        location: "",
        amount: parseAmount(cm[7]),
        installment: cm[6],
        interestRate: null,
        section: sectionForRegion(currentRegion),
      });
    }
  }

  const sumBySection = (section: ParsedTransaction["section"]) =>
    transactions.filter((t) => t.section === section).reduce((sum, t) => sum + t.amount, 0);

  const buildCheck = (
    section: SectionReconciliation["section"],
    parsedSum: number,
    printedTotal: number | null,
  ): SectionReconciliation => {
    const delta = printedTotal === null ? null : parsedSum - printedTotal;
    return { section, parsedSum, printedTotal, delta, balances: printedTotal !== null && delta === 0 };
  };

  const checks: SectionReconciliation[] = [
    buildCheck("payment", sumBySection("payment"), printedPayments),
    buildCheck("pat", sumBySection("pat"), printedPat),
    buildCheck("single", sumBySection("single"), printedSingle),
    buildCheck("installment", sumBySection("installment"), printedInstallment),
  ];

  const reconciliation: ReconciliationResult = {
    balanced: checks.every((c) => c.printedTotal === null || c.balances),
    checks,
  };

  return { cardLastFour, statementDate, periodFrom, periodTo, totalBilled, transactions, reconciliation };
}
