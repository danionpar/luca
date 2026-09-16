CREATE TABLE `observation_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	-- Locked vocabulary, enforced at the DB boundary (not just in
	-- TypeScript): drizzle's sqlite `text({enum})` is TS-only and emits no
	-- CHECK constraint on its own, so it is added here by hand.
	`relation` text NOT NULL CHECK (`relation` IN ('related', 'compatible', 'scoped', 'conflicts_with', 'supersedes', 'not_conflict')),
	`reason` text,
	`evidence` text,
	`confidence` real,
	`judgment_status` text DEFAULT 'pending' NOT NULL CHECK (`judgment_status` IN ('pending', 'confirmed', 'rejected')),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`topic_key` text,
	`normalized_hash` text NOT NULL,
	`revision_count` integer DEFAULT 1 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
-- `topic_key` is what makes `save_insight` an upsert: unique when present,
-- so the same key can be looked up and updated in place. SQLite unique
-- indexes treat NULLs as distinct from each other, so any number of
-- observations may have no topic_key at all.
CREATE UNIQUE INDEX `observations_topic_key_unique` ON `observations` (`topic_key`);
--> statement-breakpoint
-- Supports the rolling-window dedup lookup in `saveInsight` (most recent
-- rows sharing a normalized_hash), and the relation lookups in
-- `search_insights`/`link_insights`.
CREATE INDEX `observations_normalized_hash_idx` ON `observations` (`normalized_hash`);
--> statement-breakpoint
CREATE INDEX `observation_relations_source_id_idx` ON `observation_relations` (`source_id`);
--> statement-breakpoint
CREATE INDEX `observation_relations_target_id_idx` ON `observation_relations` (`target_id`);
