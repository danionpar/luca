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

/** True when an item's text is non-empty and made up entirely of whitespace. */
function isWhitespaceItem(item: PositionedItem): boolean {
  return item.text.length > 0 && item.text.trim().length === 0;
}

/**
 * Estimates the width of one character on a page from its non-whitespace
 * items, as the median of `width / str.length`. pdf.js collapses a run of
 * whitespace into a single item whose `str` is one space but whose `width`
 * spans the whole gap — that item carries no usable character width of its
 * own, so whitespace items are excluded from the estimate.
 */
function estimateCharWidth(items: PositionedItem[]): number {
  const widths = items
    .filter((item) => !isWhitespaceItem(item) && item.text.length > 0 && item.width > 0)
    .map((item) => item.width / item.text.length)
    .sort((a, b) => a - b);

  if (widths.length === 0) return 0;

  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 0 ? (widths[mid - 1] + widths[mid]) / 2 : widths[mid];
}

/**
 * Rebuilds a line of text from items ordered left to right, inserting spaces
 * proportional to the horizontal gap between them so column structure survives.
 */
function joinLine(items: PositionedItem[], charWidth: number): string {
  let line = "";
  let cursor: number | null = null;

  for (const item of items) {
    if (isWhitespaceItem(item)) {
      // A whitespace item's `str` is collapsed to one space regardless of the
      // actual gap it spans, so its width — not its text — carries the signal.
      const spaces = charWidth > 0 ? Math.round(item.width / charWidth) : 1;
      line += " ".repeat(Math.min(Math.max(spaces, 1), MAX_GAP_SPACES));
      cursor = item.x + item.width;
      continue;
    }

    if (cursor !== null) {
      const gap = item.x - cursor;

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
  // Estimated once per page (not per line) so short lines with few or no
  // non-whitespace items still get a stable character-width estimate.
  const charWidth = estimateCharWidth(items);

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    const sameLine = current && Math.abs(current[0].y - item.y) <= LINE_TOLERANCE;

    if (sameLine) current.push(item);
    else lines.push([item]);
  }

  return lines.map((line) => joinLine([...line].sort((a, b) => a.x - b.x), charWidth));
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
