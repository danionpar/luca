import { existsSync } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { basename, extname, join } from "node:path";

// The tool's own output folders. Never descended into when discovering PDFs
// to import — otherwise a second run would re-discover (and re-attempt) the
// files it already processed or already gave up on.
const OWN_OUTPUT_DIRS = new Set(["processed", "failed"]);

/** Recursively finds every `.pdf` file under `folderPath`, skipping the tool's own `processed/` and `failed/` output folders. */
export async function discoverPdfPaths(folderPath: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (OWN_OUTPUT_DIRS.has(entry.name.toLowerCase())) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") {
        found.push(join(dir, entry.name));
      }
    }
  }

  await walk(folderPath);
  return found;
}

/** Picks a non-colliding destination path inside `destDir` for `basename(filePath)`. */
function nonCollidingDestination(destDir: string, filePath: string): string {
  const ext = extname(filePath);
  const stem = basename(filePath, ext);
  let dest = join(destDir, `${stem}${ext}`);
  let n = 2;
  while (existsSync(dest)) {
    dest = join(destDir, `${stem}-${n}${ext}`);
    n++;
  }
  return dest;
}

/**
 * Moves `filePath` into a `processed/` or `failed/` subfolder of
 * `rootFolder` (the folder the import was pointed at, not the file's own
 * containing directory — statements may be nested by year/month and the
 * tool does not interpret that layout). The source is never deleted: a
 * rename is the only filesystem mutation this tool performs on a PDF.
 */
export async function moveStatementFile(
  filePath: string,
  rootFolder: string,
  outcome: "processed" | "failed",
): Promise<string> {
  const destDir = join(rootFolder, outcome);
  await mkdir(destDir, { recursive: true });
  const dest = nonCollidingDestination(destDir, filePath);
  await rename(filePath, dest);
  return dest;
}
