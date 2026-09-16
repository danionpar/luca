import { test } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "../queries/__fixtures__/test-db.js";
import { deleteInsight, getInsight, linkInsights, listInsights, pinInsight, saveInsight, searchInsights, unpinInsight } from "./store.js";

test("topic_key makes a save an upsert: same topic_key updates in place and increments revision_count", () => {
  const db = createTestDb();

  const first = saveInsight(db, { type: "convention", title: "Groceries trend", content: "March groceries are up.", topicKey: "groceries-trend" });
  assert.equal(first.created, true);
  assert.equal(first.revisionCount, 1);

  const second = saveInsight(db, { type: "convention", title: "Groceries trend", content: "April groceries are down.", topicKey: "groceries-trend" });
  assert.equal(second.created, false);
  assert.equal(second.upserted, true);
  assert.equal(second.id, first.id, "same topic_key must update the same row, not insert a new one");
  assert.equal(second.revisionCount, 2);

  const stored = getInsight(db, first.id);
  assert.equal(stored?.content, "April groceries are down.", "the row content reflects the latest save");

  const all = listInsights(db);
  assert.equal(all.length, 1, "an upsert never leaves a duplicate row behind");
});

test("normalized_hash dedup bumps duplicate_count instead of inserting a new row", () => {
  const db = createTestDb();

  const first = saveInsight(db, { type: "pattern", title: "Fuel is always round", content: "Fuel purchases are always over 10000 CLP and a round number." });
  assert.equal(first.created, true);
  assert.equal(first.duplicateCount, 0);

  const second = saveInsight(db, { type: "pattern", title: "Fuel is always round (again)", content: "  FUEL purchases are ALWAYS over 10000 CLP and a round number.  " });
  assert.equal(second.created, false);
  assert.equal(second.duplicated, true);
  assert.equal(second.id, first.id, "identical normalized content must dedup onto the same row");
  assert.equal(second.duplicateCount, 1);

  const all = listInsights(db);
  assert.equal(all.length, 1, "a dedup never inserts a second row");
});

test("a genuinely different save with no topic_key and no matching hash inserts a new row", () => {
  const db = createTestDb();

  saveInsight(db, { type: "pattern", title: "First", content: "First observation." });
  saveInsight(db, { type: "pattern", title: "Second", content: "Second observation." });

  assert.equal(listInsights(db).length, 2);
});

test("search_insights returns matches ranked by relevance, with a title match outranking a content-only match", () => {
  const db = createTestDb();

  const contentOnlyMatch = saveInsight(db, { type: "pattern", title: "Unrelated title", content: "This mentions bencina only in passing, deep in the content." });
  const titleMatch = saveInsight(db, { type: "pattern", title: "Bencina heuristic", content: "Some other unrelated body text." });

  const results = searchInsights(db, { query: "bencina" });

  assert.equal(results.length, 2);
  assert.equal(results[0].id, titleMatch.id, "the title match must rank first — title is weighted highest");
  assert.equal(results[1].id, contentOnlyMatch.id);
});

test("search_insights excludes soft-deleted observations", () => {
  const db = createTestDb();

  const kept = saveInsight(db, { type: "pattern", title: "Kept insight", content: "Findable content." });
  const removed = saveInsight(db, { type: "pattern", title: "Removed insight", content: "Findable content too." });
  deleteInsight(db, removed.id);

  const results = searchInsights(db, { query: "findable" });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, kept.id);
});

test("list_insights and get_insight also exclude soft-deleted rows", () => {
  const db = createTestDb();
  const insight = saveInsight(db, { type: "pattern", title: "To be deleted", content: "Some content." });

  deleteInsight(db, insight.id);

  assert.equal(listInsights(db).find((row) => row.id === insight.id), undefined);
  assert.equal(getInsight(db, insight.id), undefined);
});

test("pin_insight and unpin_insight toggle pinned, and list_insights sorts pinned first", () => {
  const db = createTestDb();
  const older = saveInsight(db, { type: "pattern", title: "Older", content: "Older content." });
  const newer = saveInsight(db, { type: "pattern", title: "Newer", content: "Newer content." });

  pinInsight(db, older.id);

  const all = listInsights(db);
  assert.equal(all[0].id, older.id, "the pinned row sorts first even though it is older");
  assert.equal(all[1].id, newer.id);

  unpinInsight(db, older.id);
  const afterUnpin = listInsights(db);
  assert.equal(afterUnpin[0].id, newer.id, "once unpinned, ordering falls back to recency");
});

test("link_insights creates a judged relation from the locked vocabulary", () => {
  const db = createTestDb();
  const a = saveInsight(db, { type: "pattern", title: "A", content: "Content A." });
  const b = saveInsight(db, { type: "pattern", title: "B", content: "Content B." });

  const relation = linkInsights(db, {
    sourceId: a.id,
    targetId: b.id,
    relation: "related",
    reason: "Both describe the same merchant-level risk.",
    evidence: "Concrete figures from both observations.",
    confidence: 0.9,
  });

  assert.equal(relation.relation, "related");
  assert.equal(relation.judgmentStatus, "confirmed");

  const results = searchInsights(db, { query: "content" });
  const withRelations = results.find((row) => row.id === a.id);
  assert.equal(withRelations?.relations.length, 1, "search_insights surfaces the judged relation as an annotation");
});

test("link_insights rejects a relation verb outside the locked vocabulary", () => {
  const db = createTestDb();
  const a = saveInsight(db, { type: "pattern", title: "A", content: "Content A." });
  const b = saveInsight(db, { type: "pattern", title: "B", content: "Content B." });

  assert.throws(() => {
    linkInsights(db, {
      sourceId: a.id,
      targetId: b.id,
      // @ts-expect-error deliberately invalid — "pending" is a judgment state, not a relation verb
      relation: "pending",
      reason: "x",
      evidence: "y",
      confidence: 0.5,
    });
  });
});
