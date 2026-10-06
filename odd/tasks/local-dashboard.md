# Local spending dashboard

**Objective:** an MCP tool that renders a self-contained HTML dashboard of spending — by month, year, category and city — written to the owner's Mac and opened in the browser.

**Why:** the owner wants to see her spending visually. Chosen over a claude.ai Artifact because publishing an Artifact uploads the data off the machine, which contradicts luca's local-only principle; she only needs to view it on her Mac for now.

**Scope (v1, basic first):** spending only — month, year, category, city. No budgets, income or savings yet (a known product gap, see `legacy-excel/analysis`).

**Constraints:** every figure from SQL; integer CLP; output file outside the repo and git-ignored; no external network fetches from the page (fully self-contained); dataviz method for every chart; public repo, synthetic fixtures only.

**Route:** delegated direct (2+ non-trivial files → one writer). TDD: off; checks via `pnpm test` / `pnpm build` in `apps/api`.

## Tasks
- [x] T1 Move city out of `description` into its own `city` column (additive migration + backfill; `description` freed for owner notes)
- [x] T2 Dashboard data query (month/year/category/city aggregates, all SQL)
- [x] T3 `render_dashboard` MCP tool → self-contained HTML, written locally and opened
- [x] T4 Verify against live DB + render and visually inspect

## Progress
- Created 2026-10-06. Decision: local HTML over Artifact (owner, 2026-10-06).
- T1 done: 37b8c7f. Reviewed against requirements (backfill copies description to city then nulls it; ingestion writes city); migration test passes.
- T2 done: 0e1c95f. SQL aggregates over the shared spending filter, uncategorised and no-city buckets, tie out with monthly_summary (tests).
- T3 done: render_dashboard (self-contained HTML, inline SVG, no network). Palette validator: light PASS (WARN contrast on 3 hues, relief via labels + table view), dark PASS.
- T4 done: build clean, tests 158 pass / 2 env-gated skips. Live DB backed up then migrated: 1203 tx / 255 categorised / 29 rules / 18 categories unchanged; 1102 rows with city, 26 distinct cities, 0 non-null descriptions. Rendered to default path, inspected via headless Chrome screenshot; render_dashboard lists over stdio.
- Note: only 9 billing months have a billing_month (nov 2025 to jul 2026), so the dashboard covers 1152 of 1203 rows.
