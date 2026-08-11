import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

// A single laptop file holding an entire financial history needs an
// explicit, easy-to-run backup path — hence this script instead of relying
// on ad hoc `cp` commands.
async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(dirname(env.DATABASE_URL), "backups");

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = join(backupDir, `luca-${timestamp}.db`);

  // Use SQLite's own backup API rather than copying the file directly: it
  // takes a consistent snapshot even if the database is in WAL mode with
  // pending writes not yet checkpointed into the main file.
  const source = new Database(env.DATABASE_URL, { readonly: true });
  await source.backup(backupPath);
  source.close();

  console.log(`Backed up ${env.DATABASE_URL} -> ${backupPath}`);
}

backup().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
