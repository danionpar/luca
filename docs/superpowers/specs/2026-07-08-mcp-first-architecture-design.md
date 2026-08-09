# Budget POC — MCP-First Architecture

**Date:** 2026-07-08
**Status:** Proposed
**Supersedes:** [2026-07-07-personal-first-reorientation-design.md](./2026-07-07-personal-first-reorientation-design.md)

## The Pivot

The project stops being a web application and becomes an **MCP server** — the same shape as engram, which is the system that inspired the insight layer in the first place.

The reasoning: the owner already pays for a Claude subscription. If the project exposes its capabilities as MCP tools, Claude Code becomes the client, the terminal becomes the interface, and Artifacts render the visuals on demand. The "AI that recognizes spending patterns and helps me decide" costs nothing extra and is far more capable than any model that would run locally on the same machine.

This deletes an entire category of problems rather than solving them: no HTTP server, no authentication, no session management, no CORS, no frontend build, no PWA, no hosting, no domain, no deployment, no always-on process. For a single-user local tool, those were all incidental complexity in service of a UI that a conversation replaces.

The interface question also resolves in the owner's favor. The stated goal is "help me decide, recognize how I spend, improve my saving capacity." That is a conversation, not a dashboard. "Can I afford a trip in October?" is an awkward dashboard feature and a natural conversational one. Bulk categorization — "categorize everything from LIDER as groceries" — is faster spoken than clicked.

## Goals

1. Understand and improve personal finances through conversation, backed by exact data.
2. Zero recurring cost. No paid hosting, no API bills, no domains. The existing Claude subscription is the only spend, and it already exists.
3. All financial data stays on the owner's machine, in a plain SQLite file.
4. Learn by building, iterating, and breaking things — the architecture should be cheap to change.

## Non-Goals

- A web UI as the primary interface (the existing Next.js app is parked, not deleted).
- Authentication, multi-user support, or any tenancy. A single local process needs none.
- Running a local LLM. The subscription covers it.
- Mobile-first usage in this phase (see Accepted Tradeoffs).

## Architecture

### Three layers

**Layer 1 — Transactional store (the truth).** Local SQLite: transactions, categories, statements, categorization rules. Typed, exact, deterministic. Nothing interprets or opines here. This is the existing schema, migrated from Postgres.

**Layer 2 — Insight store (modeled on engram).** A second set of tables in the same SQLite file, modeled on engram's design as verified by inspecting its schema:

- An `observations`-shaped table for learned patterns and advice, with `type`, `title`, `content`, `topic_key`, and lifecycle timestamps.
- FTS5 full-text search over it, as an external-content virtual table. Notably, engram stores 870 observations with **zero embeddings** — its `embedding` column is unused and the system runs on FTS5 plus structured metadata. The clone starts the same way; vectors are a later optimization, not a prerequisite.
- A `relations`-shaped table modeled on engram's `memory_relations`: `source_id`, `target_id`, `relation`, `reason`, `evidence`, `confidence`, and `superseded_at` / `superseded_by`. This is what links patterns across time. When a belief changes ("delivery spending was ~200k, now it's ~350k"), the old observation is superseded rather than deleted, preserving the history of what the system believed and when.

**Layer 3 — MCP server (the interface).** Exposes both layers as tools that Claude Code calls.

### The golden rule

**Numbers always come from SQL. The model never computes a figure, only narrates one.**

"You spent $347,500 on groceries in March, 23% above your average" is a `SUM()` with a `GROUP BY` — deterministic, instant, free, and correct. A model producing that figure will eventually invent one, and in personal finance a fabricated number is not a cosmetic bug; it is a real money decision made on false information.

Most of the desired intelligence needs no model at all:

- Recurring subscriptions — same merchant, similar amount, monthly cadence. SQL.
- Trends — simple regression over monthly totals. SQL.
- Anomalies — deviation from the category's rolling average. SQL.
- Future commitments — already implemented; the parser projects installment payments forward.

The model contributes where it is genuinely better: normalizing merchant names into entities, turning detected patterns into readable advice, and answering open questions that span the data.

### MCP tool surface (first pass)

Data in: `import_statement`, `add_transaction`.
Data out: `list_transactions`, `monthly_summary`, `spending_by_category`.
Curation: `categorize`, `bulk_categorize`, `create_rule`, `list_uncategorized`.
Analysis (deterministic): `detect_recurring`, `detect_anomalies`, `category_trend`, `projected_commitments`.
Insight layer: `save_insight`, `search_insights`, `link_insights`, `supersede_insight`.

Write tools take structured parameters; the model fills fields, it does not compose free-form rows. Bulk inserts come from the parser, which is deterministic.

### Statement ingestion

Import is folder-based. One tool call points at a directory, and the server walks it recursively for PDFs.

**The folder layout is not interpreted.** The owner may organize statements by year and month, or not at all — the tool does not parse folder or file names to determine the period. The parser already extracts `periodFrom`, `periodTo`, and `statementDate` from the PDF content itself, which is authoritative. Coupling ingestion to a naming convention would break the moment a file is renamed or a folder is reorganized.

Files are processed in chronological order by the statement date read from each PDF, so the history is built oldest-first and any run is deterministic.

**Processed files are archived, not deleted.** After a successful import the file moves to a `processed/` subfolder, keeping the inbox clean — which is the actual goal — without destroying the source. Deletion is rejected for three reasons:

1. The PDFs are the *primary* record; the database is a *derived* artifact. Deleting the original and keeping the derivative inverts the correct relationship.
2. Parsers change. When installment detection improves or another bank is added, re-importing from source is the only way to correct history. Without the originals, a parsing error becomes permanent and silent.
3. Statements are a few hundred kilobytes. Storage is not a real constraint, and the trade is a permanent loss against a negligible saving.

Re-importing is already safe: the existing implementation detects duplicate statements (409) and deduplicates individual transactions by reference code, so a repeated import does not double-count. Deletion was never needed for correctness.

Failed files move to a `failed/` subfolder with the error recorded, so a bad PDF does not block the batch and can be retried after a fix.

The import tool returns a summary per run: imported, skipped as duplicate, and failed with reasons.

**Passwords.** Banco de Chile statements are encrypted. A default password is configured once (statements typically use a stable, identity-derived password), with a per-file override available for exceptions.

**Location.** The statements folder lives outside the repository — the repository is public, and real statements must never enter it. `*.pdf` and `statements/` are git-ignored as a second line of defense.

### Visuals via Artifacts

Charts and dashboards are generated as Artifacts on demand rather than maintained as a frontend. To keep them consistent rather than a different design every time, the repository carries a documented house style — palette, typography, chart conventions, layout patterns — that is applied to every generated visual. The result is a recognizable, stable look without owning a UI codebase.

### Escape hatch (deliberate safeguard)

The tool logic is also exposed as a thin CLI, so the data and its core operations are never hostage to MCP or to any subscription. The SQLite file is plain and queryable with any tool. This is a small cost that prevents a single point of failure over a decade of financial history.

## What Survives, What Is Parked

**Survives** — this is roughly the valuable half of the existing code:
- The Banco de Chile PDF parser, including installment detection and forward projection. The crown jewel.
- The database schema and its domain modeling.
- The category taxonomy and its seed data.
- The monthly summary logic.

**Parked** (kept in the repository, not deleted, in case a UI is wanted later):
- `apps/web` — the entire Next.js frontend.

**Removed:**
- Better Auth and the four auth tables; a single local process has no one to authenticate.
- The Fastify HTTP layer, CORS, and multipart upload handling.
- `@neondatabase/serverless`, `pdfjs-dist` as an unused dependency (see below — it may return as the parser's actual PDF reader).
- Per-row `userId` scoping, which was only meaningful for a multi-user product.

## Known Defects to Fix

**The parser is broken or fragile right now.** It invokes `execSync("python3 -c ...")` with a bare `python3` (`apps/api/src/parsers/banco-chile-credit-card.ts:41`). On this machine `which python3` resolves to `/usr/bin/python3`, the Apple system interpreter, which does **not** have `pypdf`; only `/opt/homebrew/bin/python3` has it. The parser therefore depends on inherited PATH and will fail depending on how the process is launched. Since backfilling historical statements is the foundation of the entire learning layer, this blocks everything.

The fix is to remove Python from the pipeline and extract PDF text in Node. `pdfjs-dist` is already declared as a dependency in `apps/api` and never imported — today's dead dependency may be the solution. This simultaneously eliminates an undeclared system requirement and removes the biggest installation barrier for a public repository. Whether `qpdf` can also be replaced (for password-protected statements) is an open implementation question for the plan.

## Accepted Tradeoffs

- **Mobile access is lost in this phase.** The owner previously chose "check plus quick-log from the phone." With an MCP server on the MacBook, the phone is not a client. This is accepted because the machine of record is the laptop and statement import — not manual entry — is the main data path. A UI or a sync path can return later; `apps/web` is parked precisely for that.
- **Quick capture has more friction.** Opening a terminal to log a coffee is worse than tapping a phone. Mitigated by statements being the primary source of truth rather than manual entry.
- **The app lives inside Claude Code.** Mitigated by the CLI escape hatch and the plain SQLite file.

## Dependency Policy

Carried forward from the superseded spec, adjusted for the pivot. Do now: migrate Drizzle to the SQLite dialect (`drizzle-orm` 0.39→0.45, `drizzle-kit` 0.30→0.31), drop `@neondatabase/serverless`, drop `better-auth`, pin the Node version (the repo has no `engines` and no `.nvmrc`, with three conflicting `@types/node` versions). Add an MCP SDK. Defer the majors that buy nothing: TypeScript 5.7→7.0, Next 15→16, ESLint 9→10, zod 3→4.

Note also that `packages/shared` is declared as a dependency by both apps and imported by neither, with types that have drifted from the schema. It is either adopted or removed during the restructure.

## Repository and Distribution

The repository is **public** on the owner's personal GitHub account (`danionpar`, already the authenticated `gh` account). The reasoning holds: data lives locally, so the code exposes nothing. This is also the ideal moment — the repository has zero commits, so no secret has ever entered its history. Verified: no real statement PDFs are present, and the only environment file that would be committed is `.env.example`, containing placeholders.

Making it genuinely usable by non-programmers is its own project and is sequenced last. The path is: remove the Python dependency, then a one-command setup, then a README that assumes no prior knowledge. A README alone does not make a pnpm monorepo with system dependencies approachable.

## Delivery Order

The order is forced by dependency, not preference — the insight layer cannot learn from an empty database, and the database cannot be filled while the parser is broken.

0. **Fix the parser** — PDF extraction in Node, no Python. Unblocks everything.
1. **Local SQLite + strip the HTTP/auth layer** — the schema migration plus removing what the pivot makes dead.
2. **MCP server, core tools** — import, query, categorize, summarize.
3. **Backfill** — import historical statements and populate the database.
4. **Insight layer** — observations, relations, FTS5, and the deterministic pattern detectors.
5. **Artifact house style** — consistent visuals.
6. **Public polish** — one-command setup and a README for a general audience.

Steps 0–3 deliver "I can actually review my accounts." Step 4 is the original vision, arriving when it has data to work with.

## Testing

- Parser tests against fixture statements, including the currently-broken extraction path. Fixtures must be synthetic or redacted — no real statements in a public repository.
- Unit tests for rule matching and priority resolution.
- Unit tests for each deterministic detector (recurring, anomaly, trend), since these produce the numbers the model will narrate and a wrong figure here propagates as confident bad advice.
- A migration check confirming month-filter queries return identical results on SQLite to what Postgres returned (the current queries use Postgres-only `EXTRACT(...)` and `::date` casts that become `strftime`).
