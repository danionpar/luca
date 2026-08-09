import { parseBancoChileCreditCardStatement } from "../parsers/banco-chile-credit-card.js";

// Point this at a statement of your own; never hardcode a real path or
// password in source that may be committed to a public repository.
const PDF_PATH = process.env.REFERENCE_PDF_PATH;
const PASSWORD = process.env.REFERENCE_PDF_PASSWORD ?? "";

async function test() {
  if (!PDF_PATH) {
    console.error("Set REFERENCE_PDF_PATH (and REFERENCE_PDF_PASSWORD if the statement is encrypted).");
    process.exitCode = 1;
    return;
  }

  console.log("Parsing statement...\n");
  const result = await parseBancoChileCreditCardStatement(PDF_PATH, PASSWORD);

  console.log("=== HEADER ===");
  console.log(`Card: ****${result.cardLastFour}`);
  console.log(`Statement date: ${result.statementDate}`);
  console.log(`Period: ${result.periodFrom} → ${result.periodTo}`);
  console.log(`Total billed: $${result.totalBilled.toLocaleString("es-CL")}`);
  console.log(`Transactions found: ${result.transactions.length}\n`);

  const sections = { single: 0, installment: 0, charge: 0, payment: 0 };
  for (const tx of result.transactions) {
    sections[tx.section]++;
  }
  console.log("=== BY SECTION ===");
  console.log(`Single purchases: ${sections.single}`);
  console.log(`Installments: ${sections.installment}`);
  console.log(`Charges/fees: ${sections.charge}`);
  console.log(`Payments/refunds: ${sections.payment}\n`);

  console.log("=== SINGLE PURCHASES (first 10) ===");
  result.transactions
    .filter((t) => t.section === "single")
    .slice(0, 10)
    .forEach((t) => {
      console.log(`  ${t.date} | $${t.amount.toLocaleString("es-CL").padStart(10)} | ${t.merchant}`);
    });

  console.log("\n=== INSTALLMENTS (first 5) ===");
  result.transactions
    .filter((t) => t.section === "installment")
    .slice(0, 5)
    .forEach((t) => {
      console.log(`  ${t.date} | $${t.amount.toLocaleString("es-CL").padStart(10)} | ${t.installment} | ${t.merchant}`);
    });

  console.log("\n=== CHARGES/FEES ===");
  result.transactions
    .filter((t) => t.section === "charge")
    .forEach((t) => {
      console.log(`  ${t.date} | $${t.amount.toLocaleString("es-CL").padStart(10)} | ${t.merchant}`);
    });

  console.log("\n=== PAYMENTS/REFUNDS ===");
  result.transactions
    .filter((t) => t.section === "payment")
    .forEach((t) => {
      console.log(`  ${t.date} | $${t.amount.toLocaleString("es-CL").padStart(10)} | ${t.merchant}`);
    });

  // Verify totals
  const singleTotal = result.transactions
    .filter((t) => t.section === "single")
    .reduce((sum, t) => sum + t.amount, 0);
  const installmentTotal = result.transactions
    .filter((t) => t.section === "installment")
    .reduce((sum, t) => sum + t.amount, 0);
  const chargeTotal = result.transactions
    .filter((t) => t.section === "charge" || t.section === "payment")
    .reduce((sum, t) => sum + t.amount, 0);

  console.log("\n=== TOTALS ===");
  console.log(`Single purchases: $${singleTotal.toLocaleString("es-CL")}`);
  console.log(`Installments: $${installmentTotal.toLocaleString("es-CL")}`);
  console.log(`Charges/refunds: $${chargeTotal.toLocaleString("es-CL")}`);
  console.log(`Sum: $${(singleTotal + installmentTotal + chargeTotal).toLocaleString("es-CL")}`);
}

test().catch(console.error);
