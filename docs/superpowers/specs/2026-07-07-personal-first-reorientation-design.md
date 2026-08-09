# Luca — Personal-First Reorientation

**Date:** 2026-07-07 (revised 2026-07-08)
**Status:** SUPERSEDED by [2026-07-08-mcp-first-architecture-design.md](./2026-07-08-mcp-first-architecture-design.md)
**Decision:** Approach A — simplify in place, re-prioritize the backlog toward daily personal use. No re-architecture, no rebuild.

> **Superseded 2026-07-08.** This document assumed a web application (Next.js UI + Fastify HTTP API + auth) as the delivery vehicle. The project pivoted to an MCP-server-first architecture where Claude Code is the client, the terminal is the interface, and Artifacts render the visuals. The findings here about the codebase, the SQLite migration, and the dependency audit remain accurate and are carried forward; the delivery architecture does not. Kept for the decision trail.

## Context

Luca was initially oriented toward a scalable multi-user product. The owner's actual goal is a personal finance tracker: upload bank statements, record expenses, and understand saving capacity. The machine of record is a single MacBook.

An exploration of the current state (~3,100 LOC) found the foundation is solid and functional: email+password auth (Better Auth), transaction CRUD with monthly summary, category CRUD, and a sophisticated Banco de Chile credit-card PDF parser (qpdf decryption, installment detection, forward projection of future installment payments, duplicate detection). The gap is not architecture — it is missing personal-use features.

## Goals

1. Make the app usable every day for one person: a live dashboard, effortless categorization of imported transactions, and quick expense entry.
2. Keep everything local and free: no paid hosting, no domains, no cloud database. All data stays on the owner's machine.

## Non-Goals

- Paid hosting, custom domains, or any recurring cost.
- Native mobile app (mobile is a responsive PWA reached over the local network).
- Email ingestion (IMAP/Gmail) — deferred.
- Organizations, roles, billing, or any multi-tenant product work.
- Rewriting or replacing the PDF parser.
- Removing the multi-user data model (userId scoping stays; it costs nothing daily and removing it is pure rework).

## Architecture

Unchanged in shape: Turborepo + pnpm monorepo; `apps/api` (Fastify 5 + Drizzle + Better Auth); `apps/web` (Next.js 15 App Router + Tailwind 4 + shadcn); `packages/shared` (types).

### Local-only data (revised 2026-07-08)

The database moves from **Neon serverless Postgres (cloud) to local SQLite**. Personal financial data must not leave the machine, and a cloud database contradicts the local-only goal regardless of its free tier.

- Driver: `better-sqlite3` with `drizzle-orm/better-sqlite3`. Drop `@neondatabase/serverless`.
- The database file is git-ignored and lives outside version control.
- Dialect migration in `apps/api`: `pgTable`→`sqliteTable`; the three `pgEnum` declarations→`text({ enum: [...] })`; `timestamp`/`defaultNow()`→`integer({ mode: "timestamp" })`; `boolean`→`integer({ mode: "boolean" })`; `uuid().defaultRandom()`→text primary key with an application-generated UUID.
- Amounts are already stored as `integer` (CLP has no practical decimal component), so there is no money-precision concern in the move.
- **Known gotcha:** `src/routes/transactions.ts` and the two dev scripts use raw `EXTRACT(MONTH FROM ...::date)` in month filters. Both `EXTRACT()` and the `::date` cast are Postgres-only and must become `strftime('%m', ...)`.
- Better Auth's Drizzle adapter switches from `provider: "pg"` to `provider: "sqlite"`.
- `drizzle.config.ts` switches to `dialect: "sqlite"`; `DATABASE_URL` becomes a local file path. Postgres migrations are not portable and the migration set is regenerated.
- **Backups**: the SQLite file lives in a Time Machine-covered location, plus a `db:backup` script that writes a timestamped copy. A single laptop file holding the entire financial history needs an explicit backup story.

### Access from other devices

The app binds to the local network. A phone reaches it over the LAN, or over Tailscale (free tier, no domain required) when away from home — with the understanding that the MacBook must be awake. Mobile is therefore best-effort and the desktop remains the machine of record.

### Targeted cleanup

- Close registration: an environment flag disables sign-up in Better Auth; the register page is removed. Login stays — it is cheap, already working, and earns its keep the moment the app is reachable over Tailscale.
- `packages/shared` is declared as a dependency by both apps but imported by neither, and its types have drifted from the schema (`billingMonth`, `isProjected`, `installmentCurrent/Total`, `totalProjected`, `totalSavings`). Update the types to match and have the apps actually import them.
- Remove the unused `pdfjs-dist` dependency.
- Declare the parser's undeclared system requirements (`qpdf`, `python3` + `pypdf`) in the README and fail with a clear message when missing.
- Pin the Node version (`engines` + `.nvmrc`): the repo currently has no pin and three conflicting `@types/node` versions.

## Dependency Policy

Upgrade only what rides along with work already being done; defer churn that does not move the app closer to daily use.

**Do now (alongside the SQLite migration):** `drizzle-orm` 0.39→0.45 and `drizzle-kit` 0.30→0.31 (the schema is being rewritten anyway), drop `@neondatabase/serverless` and `pdfjs-dist`, patch-bump `better-auth` 1.6.9→1.6.26, pin Node.

**Defer:** TypeScript 5.7→7.0, Next 15→16, ESLint 9→10, zod 3→4, `@fastify/multipart` 9→10, `dotenv` 16→17. These are majors whose only benefit is being current.

## Work Streams (in order)

### Stream 0 — Local database migration

Neon→SQLite as described above, including the `EXTRACT`→`strftime` fixes and a regenerated migration set. This comes first because every later stream reads and writes through it.

### Stream 1 — Live dashboard

The home page (`/`) consumes the existing monthly summary endpoint and shows the current month: income, expenses, committed installments, savings, available — plus recent transactions. No new API. Replaces the hardcoded `$0` cards.

### Stream 2 — Categorization

Imported transactions currently land with `categoryId = null` and there is no bulk assignment UI; the `categorization_rules` table exists but is never read or written. This stream makes it real:

- **Bulk categorize UI**: select multiple uncategorized transactions and assign a category in one action.
- **Rules engine**: a rule maps a merchant pattern to a category. Matching is case-insensitive substring (no regex in this phase). Rules are applied automatically during statement import.
- **Learn from use**: when the user manually categorizes an imported transaction, the UI offers "create a rule for this merchant" so future imports arrive pre-categorized.
- **Conflict resolution**: if multiple rules match, the highest-priority rule wins (explicit `priority` ordering); ties are broken by creation date, oldest first, so behavior is stable.

### Stream 3 — PWA + quick add

- Responsive pass over all pages (they are currently desktop-oriented).
- Web app manifest + icons so the app can be added to the phone home screen.
- A mobile-first quick-add flow for expenses: amount + category + done, optimized for one-thumb use. Defaults: type = expense, date = today, description optional.

### Stream 4 — Run it reliably, locally

- A single command that brings up API + web.
- Optional: a launchd agent so the app is always running on the MacBook without a terminal open.
- Optional: Tailscale for away-from-home phone access.
- No Dockerfile, no cloud deploy, no domain.

## Error Handling & Edge Cases

- Duplicate statement upload: already handled (409 + per-transaction dedup by reference code). Unchanged.
- Rule conflicts: resolved by priority as described above.
- Projected installment rows (`isProjected`): shown on the dashboard as "committed", never counted as realized expenses — consistent with the existing `/transactions` summary.
- Quick add with the API unreachable: show a clear error and keep the entered data in the form; no offline queue in this phase.
- Missing `qpdf`/`python3` at statement upload: fail with an actionable message naming the missing binary, not a stack trace.

## Testing

- Parser tests with fixture statements (the existing throwaway `test-parser.ts` script becomes real tests).
- Unit tests for rule matching and priority resolution.
- A migration smoke test confirming the month-filter queries return the same results on SQLite that they did on Postgres.
- No E2E in this phase.

## Delivery Order

Stream 0 → 1 → 2 → 3 → 4. Streams 0-2 are what make the app answer "how are my finances doing"; Stream 3 makes it pleasant on a phone; Stream 4 makes it always-on. Each stream leaves the app in a working state.
