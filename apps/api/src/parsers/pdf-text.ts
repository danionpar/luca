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
