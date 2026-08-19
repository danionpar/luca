import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

// The package root, derived from this module's own location rather than from
// process.cwd(). The MCP server is launched by a client (Claude Code) whose
// working directory is wherever the user happens to be, so anchoring on cwd
// would silently open a DIFFERENT, empty database instead of failing loudly.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// A single local process reading a local SQLite file needs nothing but the
// file's path. Everything else here (PORT, HOST, CORS_ORIGIN, the Better
// Auth secrets) belonged to the Fastify/web era and has no reader left.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("./data/luca.db"),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  // A relative DATABASE_URL is resolved against the package root, never the
  // caller's working directory. An absolute one is honoured as given.
  DATABASE_URL: isAbsolute(parsed.DATABASE_URL)
    ? parsed.DATABASE_URL
    : resolve(packageRoot, parsed.DATABASE_URL),
};
