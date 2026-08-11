import "dotenv/config";
import { z } from "zod";

// A single local process reading a local SQLite file needs nothing but the
// file's path. Everything else here (PORT, HOST, CORS_ORIGIN, the Better
// Auth secrets) belonged to the Fastify/web era and has no reader left.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("./data/luca.db"),
});

export const env = envSchema.parse(process.env);
