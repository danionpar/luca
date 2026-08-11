CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`type` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`merchant_pattern` text NOT NULL,
	`times_used` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `imported_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`bank` text NOT NULL,
	`card_last_four` text NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`statement_date` text NOT NULL,
	`total_billed` integer NOT NULL,
	`transactions_imported` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`merchant` text,
	`description` text,
	`transaction_date` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`bank` text,
	`payment_method` text,
	`raw_email_uid` text,
	`billing_month` text,
	`is_projected` integer DEFAULT false NOT NULL,
	`installment_current` integer,
	`installment_total` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
