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
