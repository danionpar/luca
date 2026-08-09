import { extractPdfText } from "./pdf-text.js";
import { parseStatementText } from "./statement-text-parser.js";
import type { ParsedStatement, ParsedTransaction } from "./statement-text-parser.js";

export type { ParsedStatement, ParsedTransaction };

/**
 * Parses a Banco de Chile credit card statement PDF.
 *
 * Pure Node: no shell-outs to external tools or interpreters, no temporary
 * files. The `password` parameter is kept for interface stability with
 * callers such as `routes/statements.ts`; current statements are not
 * encrypted, so callers pass an empty string.
 */
export async function parseBancoChileCreditCardStatement(
  pdfPath: string,
  password: string,
): Promise<ParsedStatement> {
  return parseStatementText(await extractPdfText(pdfPath, password));
}
