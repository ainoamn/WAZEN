CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`locale` text DEFAULT 'ar' NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`type` text NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`balance_minor` integer DEFAULT 0 NOT NULL,
	`goal_minor` integer DEFAULT 0 NOT NULL,
	`accent` text DEFAULT 'emerald' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`user_id` text,
	`display_name` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`due_minor` integer DEFAULT 0 NOT NULL,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`extra_minor` integer DEFAULT 0 NOT NULL,
	`avatar` text DEFAULT '#0f766e' NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contribution_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`due_day` integer DEFAULT 1 NOT NULL,
	`extra_policy` text DEFAULT 'personal_reserve' NOT NULL,
	`starts_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`member_id` text,
	`kind` text NOT NULL,
	`allocation` text DEFAULT 'general' NOT NULL,
	`amount_minor` integer NOT NULL,
	`description_ar` text NOT NULL,
	`description_en` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_spaces_owner_user_id` ON `spaces` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_members_space_id` ON `members` (`space_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_space_date` ON `transactions` (`space_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_user_id` ON `transactions` (`user_id`);
--> statement-breakpoint
PRAGMA optimize;
