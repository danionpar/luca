# Luca

A personal finance tracker for Chilean bank statements — starting with Banco
de Chile credit card statements. It runs entirely on your own machine: your
financial data never leaves it.

## Status

Early and in progress. The statement parser works and has been verified
against real statements (see below). The rest of the tool is being reshaped
into an MCP server, so it can be driven conversationally from Claude Code —
"import this month's statement," "how much did I spend on groceries" — with
charts rendered as Artifacts instead of a traditional web UI.

The target architecture is written up in
[`docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md`](docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md).
Expect the HTTP API and web app in this repository to be replaced as that
direction lands.

## Requirements

- Node 24 or newer
- pnpm 9

That's it. Statement parsing is pure Node — no Python, no qpdf, no other
system dependencies to install.

## Setup

```bash
pnpm install
```

## Running the tests

```bash
cd apps/api && pnpm test
```

Tests that need a real bank statement skip automatically when no statement is
configured, so a fresh clone passes with no setup.

## How the parser is verified

The statement parser extracts text from the PDF with
[`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) and parses that text
against the layout Banco de Chile uses for credit card statements.

An earlier version of this parser shelled out to a Python reference
implementation to check its output. That reference turned out to have its own
bug: it silently dropped transactions under certain conditions, which made it
an unreliable yardstick. The current approach instead checks each statement
against itself — every statement prints its own section subtotals and a grand
total, so the parsed transactions are reconciled against those printed
figures rather than against a second implementation. A statement that
reconciles is proof the parser didn't drop or miscount anything, independent
of what any other tool would have produced.

## Privacy

Real bank statements and the local database are git-ignored and must never be
committed. Every fixture in this repository is synthetic — no real statement,
merchant name, card number, or amount appears anywhere in the source or its
history going forward.
