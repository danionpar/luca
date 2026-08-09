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

// Bare `python3` resolves to /usr/bin/python3 on this machine, which lacks
// pypdf. Homebrew's Python has it installed, so we call it by absolute path.
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
