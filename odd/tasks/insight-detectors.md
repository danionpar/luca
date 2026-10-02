# Insight detectors (Stream 4b)

**Objective:** deterministic SQL detectors that PROPOSE spending patterns into the insight layer, so luca moves from holding what it was taught to suggesting what it notices.

**Why:** the owner's biggest uncategorised block is bare `PAYU` (108 rows, ~1.04M CLP) with no merchant name. Only amount + cadence can tell those purchases apart — that is what these detectors surface.

**Constraints:** numbers come from SQL, never from the model; proposals are candidates the owner confirms, never auto-applied; money stays integer CLP; public repo, no real merchant/amount in fixtures; no change to Layer 1 behaviour or `src/parsers/`.

**Route:** delegated direct (2+ non-trivial files → one writer). TDD: off (not configured); ordinary functional checks via `pnpm test` / `pnpm build` in `apps/api`.

## Tasks
- [x] T1 `detect_recurring` — clusters by (merchant, amount band) across billing months; excludes `payment` section and instalment rows
- [x] T2 `category_trend` — per-category monthly series with direction
- [x] T3 `detect_anomalies` — month vs trailing average per category
- [x] T4 proposals persist as observations with stable `topic_key` so reruns upsert
- [x] T5 verify against the live DB (counts only) + README status table

## Progress
- Created 2026-09-30.
- Resumed 2026-10-01 from an interrupted writer: reviewed the partial `detect_recurring` work against T1 (instalments, payment/pat, projected, refunds excluded; per-merchant amount bands; PAYU case covered by tests) and kept it unchanged. Committed as 39a9d3a.
- T2/T3/T4: `category_trend` (least-squares slope and direction computed in SQL, uncategorised its own series, zero-filled months) and `detect_anomalies` (trailing average, minimum history, minimum delta) plus proposals under stable topic keys (`recurring/<slug>/<amount>`, `trend/<category-id>`, `anomaly/<month>/<category-id>`). Commit 5109aad.
- Evidence: `pnpm build` clean; `pnpm test` in apps/api 145 pass, 0 fail, 2 env-gated skips. Synthetic tests cover every case in the brief, including upsert (revision_count up, row count unchanged).
- T5 live DB (backup taken first, `saveAsInsights` never true): recurring clusters 24 (10 on gateway merchants, 20 fully uncategorised); trends over 2026-02..2026-07: 5 rising, 4 falling, 3 flat (uncategorised series: flat); anomalies for 2026-07: 5 (2 above). Layer 1 unchanged: 1203 transactions / 255 categorised / 29 rules; observations still 4. All three tools list over stdio (23 tools total). README status row updated.
