import type { db } from "../../db/index.js";

/**
 * The drizzle handle every query/categorization function takes as its first
 * argument, instead of importing the module-level singleton directly. This
 * is what makes the logic testable against a temporary scratch SQLite
 * database seeded with synthetic data, and what `createLiveQueryDeps`-style
 * wiring passes the real `db` singleton into at the tool layer.
 */
export type LucaDb = typeof db;
