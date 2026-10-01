import type { LucaDb } from "../queries/db-types.js";
import { saveInsight } from "./store.js";

/**
 * Turns a string into a stable, filesystem/URL-safe slug for use inside a
 * `topic_key`. Deterministic and lossy on purpose (case, punctuation and
 * runs of whitespace all collapse), so cosmetic variation in a merchant name
 * never forks a proposal into two rows.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "unknown";
}

export interface ProposalInput {
  /** Observation type: "pattern" for recurring/trend findings, "warning" for anomalies. */
  type: "pattern" | "warning";
  title: string;
  /** Stable, deterministic key derived from the finding — re-running a detector must reproduce it. */
  topicKey: string;
  /** The evidence sentence(s): months, counts, exact integer CLP amounts. */
  evidence: string;
}

export interface SavedProposal {
  topicKey: string;
  id: number;
  created: boolean;
  upserted: boolean;
  revisionCount: number;
}

const PROPOSAL_NOTICE =
  "This is a PROPOSAL awaiting the owner's confirmation, produced by a deterministic detector. Nothing was categorised and no rule was created; the owner decides whether to act on it.";

/**
 * Writes one detector finding through the regular insight store (never raw
 * SQL), so `topicKey` upsert semantics apply: re-running a detector updates
 * the same row and bumps `revisionCount` instead of piling up duplicates.
 *
 * A proposal is only ever an observation. It never creates a categorisation
 * rule and never touches a transaction.
 */
export function saveProposal(db: LucaDb, proposal: ProposalInput): SavedProposal {
  const result = saveInsight(db, {
    type: proposal.type,
    title: proposal.title,
    content: `${proposal.evidence} ${PROPOSAL_NOTICE}`,
    topicKey: proposal.topicKey,
  });
  return { topicKey: proposal.topicKey, id: result.id, created: result.created, upserted: result.upserted, revisionCount: result.revisionCount };
}

/** Formats an integer CLP figure with thousands separators, e.g. 15990 -> "15,990 CLP". Formatting only — never arithmetic. */
export function formatClp(amount: number): string {
  return `${amount.toLocaleString("en-US")} CLP`;
}
