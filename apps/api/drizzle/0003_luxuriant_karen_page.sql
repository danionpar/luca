PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`merchant_pattern` text NOT NULL,
	`times_used` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_categorization_rules`("id", "category_id", "merchant_pattern", "times_used", "created_at", "updated_at") SELECT "id", "category_id", "merchant_pattern", "times_used", "created_at", "updated_at" FROM `categorization_rules`;--> statement-breakpoint
DROP TABLE `categorization_rules`;--> statement-breakpoint
ALTER TABLE `__new_categorization_rules` RENAME TO `categorization_rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;