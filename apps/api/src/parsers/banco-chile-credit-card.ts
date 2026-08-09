import { execSync } from "child_process";
import { unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { parseStatementText } from "./statement-text-parser.js";
import type { ParsedStatement, ParsedTransaction } from "./statement-text-parser.js";

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
