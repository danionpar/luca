ALTER TABLE `transactions` ADD `city` text;
--> statement-breakpoint
-- Backfill: until now the statement parser's city was stored in
-- `description` because no column existed for it. Move it, then free
-- `description` for the owner's own notes. Values are copied raw.
UPDATE `transactions` SET `city` = `description` WHERE `description` IS NOT NULL;
--> statement-breakpoint
UPDATE `transactions` SET `description` = NULL WHERE `city` IS NOT NULL;
