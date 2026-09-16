-- FTS5 full-text index over `observations`, as an external-content virtual
-- table (content='observations', content_rowid='id'). External-content
-- keeps the indexed text living in one place (the real `observations` row)
-- instead of duplicating it into the FTS shadow tables, at the cost of
-- needing sync triggers below.
--
-- This requires `observations.id` to be an INTEGER PRIMARY KEY (a rowid
-- alias) rather than the UUID-text pattern used elsewhere in this schema:
-- an FTS5 rowid is always an integer, and content_rowid must match the
-- content table's real rowid values exactly.
CREATE VIRTUAL TABLE `observations_fts` USING fts5(
	title,
	content,
	topic_key,
	type,
	content = 'observations',
	content_rowid = 'id'
);
--> statement-breakpoint
-- Soft-deleted rows (`deleted_at` set) are intentionally NOT removed from
-- this index by these triggers — a soft delete is a normal UPDATE, not a
-- DELETE, so it never fires the `_ad` trigger below. Exclusion from search
-- happens at query time in `search_insights`/`list_insights`
-- (`WHERE deleted_at IS NULL`), which keeps the FTS index a faithful mirror
-- of the content table without extra trigger logic to special-case a soft
-- delete.
CREATE TRIGGER `observations_ai` AFTER INSERT ON `observations` BEGIN
	INSERT INTO `observations_fts`(rowid, title, content, topic_key, type)
	VALUES (new.id, new.title, new.content, new.topic_key, new.type);
END;
--> statement-breakpoint
CREATE TRIGGER `observations_ad` AFTER DELETE ON `observations` BEGIN
	INSERT INTO `observations_fts`(`observations_fts`, rowid, title, content, topic_key, type)
	VALUES ('delete', old.id, old.title, old.content, old.topic_key, old.type);
END;
--> statement-breakpoint
CREATE TRIGGER `observations_au` AFTER UPDATE ON `observations` BEGIN
	INSERT INTO `observations_fts`(`observations_fts`, rowid, title, content, topic_key, type)
	VALUES ('delete', old.id, old.title, old.content, old.topic_key, old.type);
	INSERT INTO `observations_fts`(rowid, title, content, topic_key, type)
	VALUES (new.id, new.title, new.content, new.topic_key, new.type);
END;
