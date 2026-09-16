import { observationRelations, observations, relationTypes } from "../../db/schema.js";
import type { LucaDb } from "../queries/db-types.js";
import { runMutation, runQuery, runQueryOne } from "../queries/raw-sql.js";
import { computeNormalizedHash } from "./normalize.js";

export type RelationType = (typeof relationTypes)[number];

function toIsoString(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

export interface ObservationRow {
  id: number;
  type: string;
  title: string;
  content: string;
  topicKey: string | null;
  normalizedHash: string;
  revisionCount: number;
  duplicateCount: number;
  lastSeenAt: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface RawObservationRow {
  id: number;
  type: string;
  title: string;
  content: string;
  topicKey: string | null;
  normalizedHash: string;
  revisionCount: number;
  duplicateCount: number;
  lastSeenAt: number;
  pinned: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

function toObservationRow(raw: RawObservationRow): ObservationRow {
  return {
    ...raw,
    lastSeenAt: toIsoString(raw.lastSeenAt),
    pinned: raw.pinned === 1,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
    deletedAt: raw.deletedAt === null ? null : toIsoString(raw.deletedAt),
  };
}

const OBSERVATION_COLUMNS = `id, type, title, content, topic_key as topicKey, normalized_hash as normalizedHash,
  revision_count as revisionCount, duplicate_count as duplicateCount, last_seen_at as lastSeenAt,
  pinned, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt`;

function selectObservationById(db: LucaDb, id: number): ObservationRow | undefined {
  const row = runQueryOne<RawObservationRow>(db, `SELECT ${OBSERVATION_COLUMNS} FROM observations WHERE id = ?`, [id]);
  return row ? toObservationRow(row) : undefined;
}

export interface RelationRow {
  id: string;
  sourceId: number;
  targetId: number;
  relation: RelationType;
  reason: string | null;
  evidence: string | null;
  confidence: number | null;
  judgmentStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface RawRelationRow {
  id: string;
  sourceId: number;
  targetId: number;
  relation: RelationType;
  reason: string | null;
  evidence: string | null;
  confidence: number | null;
  judgmentStatus: string;
  createdAt: number;
  updatedAt: number;
}

function toRelationRow(raw: RawRelationRow): RelationRow {
  return { ...raw, createdAt: toIsoString(raw.createdAt), updatedAt: toIsoString(raw.updatedAt) };
}

const RELATION_COLUMNS = `id, source_id as sourceId, target_id as targetId, relation, reason, evidence, confidence,
  judgment_status as judgmentStatus, created_at as createdAt, updated_at as updatedAt`;

/** Every relation touching `observationId`, on either side, most recent first. */
export function relationsForObservation(db: LucaDb, observationId: number): RelationRow[] {
  const rows = runQuery<RawRelationRow>(
    db,
    `SELECT ${RELATION_COLUMNS} FROM observation_relations WHERE source_id = ? OR target_id = ? ORDER BY created_at DESC`,
    [observationId, observationId],
  );
  return rows.map(toRelationRow);
}

/** Every relation touching any id in `observationIds`, batched into one query — used by search_insights to annotate a page of results without one query per row. */
export function relationsForObservations(db: LucaDb, observationIds: number[]): Map<number, RelationRow[]> {
  const byId = new Map<number, RelationRow[]>();
  if (observationIds.length === 0) return byId;

  const placeholders = observationIds.map(() => "?").join(", ");
  const rows = runQuery<RawRelationRow>(
    db,
    `SELECT ${RELATION_COLUMNS} FROM observation_relations
     WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
     ORDER BY created_at DESC`,
    [...observationIds, ...observationIds],
  );

  for (const raw of rows) {
    const relation = toRelationRow(raw);
    for (const id of [relation.sourceId, relation.targetId]) {
      if (!observationIds.includes(id)) continue;
      const list = byId.get(id) ?? [];
      list.push(relation);
      byId.set(id, list);
    }
  }
  return byId;
}

export interface SaveInsightOptions {
  type: string;
  title: string;
  content: string;
  topicKey?: string;
}

export interface SaveInsightResult {
  id: number;
  /** True only when this call inserted a brand-new row. */
  created: boolean;
  /** True when an existing row sharing `topicKey` was updated in place. */
  upserted: boolean;
  /** True when an existing row with identical (normalized) content had its duplicate_count bumped instead of inserting. */
  duplicated: boolean;
  revisionCount: number;
  duplicateCount: number;
}

/**
 * Saves an observation, following the two mechanisms the insight layer is
 * built on (see docs/superpowers/specs/2026-07-08-mcp-first-architecture-design.md,
 * "Layer 2 — Insight store"):
 *
 * 1. **`topicKey` upsert.** When `topicKey` matches an existing, non-deleted
 *    row, that row is updated in place (`type`/`title`/`content` replaced,
 *    `revisionCount` incremented) instead of inserting a new one. This is
 *    what lets an evolving observation (e.g. "this month's take on a
 *    recurring bill") update without accumulating duplicate rows.
 * 2. **`normalizedHash` dedup.** Otherwise, if a non-deleted row already
 *    holds the exact same normalized content, its `duplicateCount` and
 *    `lastSeenAt` are bumped instead of inserting again. Only the single
 *    most-recently-seen matching row is considered (the "rolling window") —
 *    a years-old identical row that has long since scrolled out of
 *    relevance never blocks a fresh insert on its own.
 *
 * Only when neither mechanism applies does this insert a genuinely new row.
 */
export function saveInsight(db: LucaDb, options: SaveInsightOptions): SaveInsightResult {
  const normalizedHash = computeNormalizedHash(options.content);

  if (options.topicKey) {
    const existing = runQueryOne<{ id: number }>(db, `SELECT id FROM observations WHERE topic_key = ? AND deleted_at IS NULL`, [options.topicKey]);
    if (existing) {
      runMutation(
        db,
        `UPDATE observations
         SET type = ?, title = ?, content = ?, normalized_hash = ?,
             revision_count = revision_count + 1, last_seen_at = unixepoch(), updated_at = unixepoch()
         WHERE id = ?`,
        [options.type, options.title, options.content, normalizedHash, existing.id],
      );
      const updated = selectObservationById(db, existing.id);
      if (!updated) throw new Error(`Observation ${existing.id} vanished immediately after being upserted.`);
      return { id: updated.id, created: false, upserted: true, duplicated: false, revisionCount: updated.revisionCount, duplicateCount: updated.duplicateCount };
    }
  }

  const duplicate = runQueryOne<{ id: number }>(
    db,
    `SELECT id FROM observations WHERE normalized_hash = ? AND deleted_at IS NULL ORDER BY last_seen_at DESC LIMIT 1`,
    [normalizedHash],
  );
  if (duplicate) {
    runMutation(db, `UPDATE observations SET duplicate_count = duplicate_count + 1, last_seen_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`, [duplicate.id]);
    const updated = selectObservationById(db, duplicate.id);
    if (!updated) throw new Error(`Observation ${duplicate.id} vanished immediately after being deduplicated.`);
    return { id: updated.id, created: false, upserted: false, duplicated: true, revisionCount: updated.revisionCount, duplicateCount: updated.duplicateCount };
  }

  const [inserted] = db
    .insert(observations)
    .values({ type: options.type, title: options.title, content: options.content, topicKey: options.topicKey ?? null, normalizedHash })
    .returning({ id: observations.id })
    .all();

  return { id: inserted.id, created: true, upserted: false, duplicated: false, revisionCount: 1, duplicateCount: 0 };
}

export interface SearchInsightResult {
  id: number;
  type: string;
  title: string;
  /** A short highlighted excerpt of `content` around the match — the full text is available via get_insight. */
  excerpt: string;
  topicKey: string | null;
  pinned: boolean;
  revisionCount: number;
  duplicateCount: number;
  lastSeenAt: string;
  relations: RelationRow[];
}

export interface SearchInsightsOptions {
  query: string;
  limit?: number;
}

/** Quotes each token of a user query as its own FTS5 phrase, so punctuation or FTS5 operator characters in free-form input never raise a query syntax error. Multiple tokens are ANDed together, same as FTS5's default. */
function buildMatchQuery(query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '""';
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" ");
}

/**
 * Full-text search over `observations_fts`, excluding soft-deleted rows,
 * ranked by weighted BM25 — title weighted highest, then topic_key, then
 * content (mirrors engram: title 5x, topic_key 3x, content 1x, and the
 * `type` column zeroed out of ranking entirely since it is indexed only for
 * exact-word filtering, not relevance).
 *
 * Results are compact (progressive disclosure): an excerpt, not the full
 * `content` — call get_insight for that. Any relations already judged for a
 * result are attached as `relations`, so a recall shows the verdict (e.g.
 * "not_conflict" against another observation) at a glance instead of
 * requiring a separate link_insights lookup.
 */
export function searchInsights(db: LucaDb, options: SearchInsightsOptions): SearchInsightResult[] {
  const matchQuery = buildMatchQuery(options.query);
  const limit = options.limit ?? 10;

  const rows = runQuery<{
    id: number;
    type: string;
    title: string;
    excerpt: string;
    topicKey: string | null;
    pinned: number;
    revisionCount: number;
    duplicateCount: number;
    lastSeenAt: number;
  }>(
    db,
    `SELECT o.id, o.type, o.title,
       snippet(observations_fts, 1, '[', ']', '...', 12) as excerpt,
       o.topic_key as topicKey, o.pinned, o.revision_count as revisionCount,
       o.duplicate_count as duplicateCount, o.last_seen_at as lastSeenAt
     FROM observations_fts
     JOIN observations o ON o.id = observations_fts.rowid
     WHERE observations_fts MATCH ? AND o.deleted_at IS NULL
     ORDER BY bm25(observations_fts, 5.0, 1.0, 3.0, 0.0)
     LIMIT ?`,
    [matchQuery, limit],
  );

  const relationsByObservation = relationsForObservations(db, rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    excerpt: row.excerpt,
    topicKey: row.topicKey,
    pinned: row.pinned === 1,
    revisionCount: row.revisionCount,
    duplicateCount: row.duplicateCount,
    lastSeenAt: toIsoString(row.lastSeenAt),
    relations: relationsByObservation.get(row.id) ?? [],
  }));
}

export interface GetInsightResult extends ObservationRow {
  relations: RelationRow[];
}

/** Full, untruncated content by id. Excluded (returns undefined) once soft-deleted, same as search. */
export function getInsight(db: LucaDb, id: number): GetInsightResult | undefined {
  const observation = selectObservationById(db, id);
  if (!observation || observation.deletedAt !== null) return undefined;
  return { ...observation, relations: relationsForObservation(db, id) };
}

export interface ListInsightsOptions {
  limit?: number;
  pinnedOnly?: boolean;
}

/** Recent/pinned first: pinned rows sort before unpinned, ties broken by most-recently-seen and then by id (newest first). Soft-deleted rows are always excluded. */
export function listInsights(db: LucaDb, options: ListInsightsOptions = {}): ObservationRow[] {
  const limit = options.limit ?? 20;
  const pinnedClause = options.pinnedOnly ? "AND pinned = 1" : "";

  const rows = runQuery<RawObservationRow>(
    db,
    `SELECT ${OBSERVATION_COLUMNS} FROM observations
     WHERE deleted_at IS NULL ${pinnedClause}
     ORDER BY pinned DESC, last_seen_at DESC, id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(toObservationRow);
}

export interface LinkInsightsOptions {
  sourceId: number;
  targetId: number;
  relation: RelationType;
  /** Required for a judged link — why these two observations are linked this way. */
  reason: string;
  /** Required for a judged link — the concrete evidence (figures, rows, dates) backing the link. */
  evidence: string;
  /** Required for a judged link, 0.0-1.0. */
  confidence: number;
}

/**
 * Creates a judged relation between two observations. `reason`, `evidence`
 * and `confidence` are required here (unlike the schema, where they are
 * nullable to also allow a future automatic "pending" candidate) because
 * every relation this tool creates is judged, never a bare guess.
 *
 * `relation` must be one of the locked vocabulary
 * (`related`/`compatible`/`scoped`/`conflicts_with`/`supersedes`/`not_conflict`)
 * — `pending` is a judgment *state*, not a verb this tool accepts, and is
 * rejected explicitly here in addition to the DB-level CHECK constraint.
 */
export function linkInsights(db: LucaDb, options: LinkInsightsOptions): RelationRow {
  if (!relationTypes.includes(options.relation)) {
    throw new Error(`Invalid relation "${options.relation}". Must be one of: ${relationTypes.join(", ")}.`);
  }

  const [inserted] = db
    .insert(observationRelations)
    .values({
      sourceId: options.sourceId,
      targetId: options.targetId,
      relation: options.relation,
      reason: options.reason,
      evidence: options.evidence,
      confidence: options.confidence,
      judgmentStatus: "confirmed",
    })
    .returning({ id: observationRelations.id })
    .all();

  const row = runQueryOne<RawRelationRow>(db, `SELECT ${RELATION_COLUMNS} FROM observation_relations WHERE id = ?`, [inserted.id]);
  if (!row) throw new Error(`Relation ${inserted.id} vanished immediately after being inserted.`);
  return toRelationRow(row);
}

export interface PinInsightResult {
  id: number;
  pinned: boolean;
}

function setPinned(db: LucaDb, id: number, pinned: boolean): PinInsightResult {
  runMutation(db, `UPDATE observations SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND deleted_at IS NULL`, [pinned ? 1 : 0, id]);
  return { id, pinned };
}

export function pinInsight(db: LucaDb, id: number): PinInsightResult {
  return setPinned(db, id, true);
}

export function unpinInsight(db: LucaDb, id: number): PinInsightResult {
  return setPinned(db, id, false);
}

export interface DeleteInsightResult {
  id: number;
  deleted: boolean;
}

/** Soft delete: sets deleted_at, which excludes the row from search_insights/list_insights/get_insight. The row and its relations are never physically removed. */
export function deleteInsight(db: LucaDb, id: number): DeleteInsightResult {
  const existing = runQueryOne<{ id: number }>(db, `SELECT id FROM observations WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!existing) return { id, deleted: false };

  runMutation(db, `UPDATE observations SET deleted_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`, [id]);
  return { id, deleted: true };
}
