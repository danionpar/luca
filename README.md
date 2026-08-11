<div align="center">

# luca

**Personal finance that stays on your machine.**

Chilean bank statements in, understanding out. Local SQLite, zero cost, no cloud.

[Status](#status) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Verification](#how-the-parser-proves-itself) · [Privacy](#privacy) · [Credits](#credits)

</div>

---

## Why "luca"

In Chile, *una luca* is a thousand pesos. Short, everyday, and unmistakably about money — which is the whole job.

The problem it solves is the boring one. Your bank emails you a PDF every month. You open it, you feel vaguely bad, you close it. Nothing accumulates, nothing is learned, and by March you cannot answer "am I actually spending more on delivery than last year?" without an afternoon of spreadsheet work.

`luca` turns those PDFs into a queryable history, and then into answers.

## Status

**Early, and honest about it.** What works today:

| Piece | State |
|---|---|
| Banco de Chile credit card statement parser | Working, reconciles exactly against 9 real statements |
| Self-verification against printed totals | Working, committed as tests |
| Local SQLite store | In progress — migrating off a hosted Postgres |
| MCP server | Designed, not built |
| Insight layer (spending patterns) | Designed, not built |
| Web UI | Removed. The project is now MCP-first; conversation replaces the dashboard |

The target architecture is written up in [`docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md`](docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md). Expect the HTTP API and web app in this repository to be replaced as that direction lands.

## Quick start

```bash
pnpm install
cd apps/api && pnpm test
```

**Requirements:** Node 24+ and pnpm 9. That is the whole list — statement parsing is pure Node, with no Python, no `qpdf`, and no other system dependency to install.

Tests that need a real bank statement skip automatically when none is configured, so a fresh clone passes with no setup.

## How it works

The design is three layers, deliberately separated:

```
                    Claude Code
                         │
                         │  MCP (stdio)
                         ▼
   ┌─────────────────────────────────────────────┐
   │  luca                                       │
   │                                             │
   │   ┌──────────────────┐  ┌────────────────┐  │
   │   │  transactions    │  │    insights    │  │
   │   │  the truth       │  │    what it     │  │
   │   │  exact, typed    │  │    learned     │  │
   │   └────────┬─────────┘  └───────┬────────┘  │
   └────────────┼────────────────────┼───────────┘
                ▼                    ▼
            SQLite  ·  FTS5   (one local file)
```

**Layer 1 — transactions.** Every purchase, bill and instalment, exactly as the bank stated it. Integers in Chilean pesos. Nothing here interprets or opines.

**Layer 2 — insights.** What the tool has *learned*: recurring bills, trends, anomalies, advice — linked to each other across time, so a belief can be revised without erasing what was believed before.

**Layer 3 — MCP.** Both layers exposed as tools. The interface is a conversation, not a dashboard: *"import last month"*, *"what's my delivery spending doing"*, *"can I afford this in October"*. Charts are rendered on demand as Artifacts rather than maintained as a frontend.

Ingestion looks like this:

```
  statement.pdf ──► pdfjs-dist ──► text ──► parser ──► reconcile ──► SQLite
                                                          │
                                                    balanced? ──► import
                                                    off by n? ──► refuse
```

### The one rule that matters

> **Numbers always come from SQL. The model never computes a figure, only narrates one.**

*"You spent $347,500 on groceries in March, 23% above your average"* is a `SUM()` and a `GROUP BY` — deterministic, instant, correct. A language model producing that number will eventually invent one, and in personal finance a fabricated number is not a cosmetic bug. It is a real decision about real money made on false information.

So recurrence, trends, anomalies and future instalment commitments are all plain SQL. The model contributes where it is genuinely better: normalising merchant names, turning detected patterns into readable advice, and answering open questions that span the data.

## How the parser proves itself

This is the part worth stealing.

An earlier version checked its output against a Python reference implementation. That reference turned out to be **silently dropping transactions** — so matching it would have certified the data loss as correct, permanently.

The fix was to stop using any reference implementation. **Every statement prints its own section subtotals and a grand total**, so the parsed transactions are reconciled against the bank's own arithmetic:

```
  single       parsed 1.178.504    printed 1.178.504    ✓
  instalments  parsed   211.969    printed   211.969    ✓
  PAT          parsed    32.943    printed    32.943    ✓
```

A statement that reconciles is proof nothing was dropped or double-counted — independent of what any other tool would have produced, and it keeps working on statements nobody has seen yet.

It also finds real bugs. Chasing a stubborn 35,000-peso delta turned up automatic bill payments (*Pago Automático de Cuentas*) being classified as one-off purchases. Cosmetic on a balance sheet, poisonous to a system whose entire job is recognising recurring commitments.

## Privacy

Real bank statements and the local database are git-ignored and must never be committed. Every fixture in this repository is synthetic — no real statement, merchant name, card number or amount appears anywhere in the source or its history.

Statements live outside the repository entirely. The database is a single plain SQLite file you can open with any tool, back up by copying, and delete by deleting.

## Credits

The insight layer is modelled on **[engram](https://github.com/Gentleman-Programming/engram)** by **Alan Buscaglia** ([@Gentleman-Programming](https://github.com/Gentleman-Programming)) — a persistent memory system for AI coding agents, in Go, MIT licensed.

Engram is the reason this project has a second layer at all. Using it daily made the idea concrete: an agent that remembers across sessions is a different tool from one that doesn't, and the same is true of a finance tracker that remembers how you spend. The specific ideas being borrowed, with gratitude:

- **Observations as first-class rows** with a `topic_key` upsert, so a belief that evolves updates in place and carries a revision count instead of piling up duplicates.
- **FTS5 as an external-content table** kept in sync by triggers, with weighted BM25 ranking — full-text search with no dependency and no vector database. Engram also demonstrates the discipline of *not* using embeddings until they earn their place.
- **A relations table** linking two observations with an explicit vocabulary, a confidence score, the evidence behind the call, and supersession — which is exactly the shape needed to connect "groceries jumped in March" to "prices rose in January."
- **Cheap candidate detection first**: a full-text scan with a relevance floor to find what *might* be related, escalating to a model only for genuinely ambiguous pairs.
- **Progressive disclosure in the tool surface** — compact results first, full content only when asked — so the agent's context stays cheap.

No engram code is used here; `luca` is TypeScript and engram is Go. What is borrowed is the design thinking, and it deserves the credit. If you want persistent memory for your own coding agent, go use the real thing: [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram).

## Contributing

Issues and pull requests are welcome. The tool currently understands one bank's statement format; if you have a Chilean statement it fails on, an issue describing the layout — **with every real value redacted** — is genuinely useful.

Two rules, both about privacy: never attach a real statement, and never commit one. Fixtures are synthetic, and the test suite is built so a fresh clone passes without any statement at all.

## License

[MIT](LICENSE) — free to use, modify and redistribute, including commercially. Keep the copyright notice, and understand that it comes with no warranty: this is a tool for reasoning about your own money, not financial advice, and you are responsible for checking the numbers it gives you.
