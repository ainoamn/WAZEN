CREATE TABLE `platform_roles` (`user_id` text PRIMARY KEY NOT NULL, `role` text DEFAULT 'customer' NOT NULL, `permissions_json` text DEFAULT '[]' NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `customer_profiles` (`user_id` text PRIMARY KEY NOT NULL, `status` text DEFAULT 'active' NOT NULL, `country` text DEFAULT 'OM' NOT NULL, `phone` text, `last_seen_at` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `plans` (`id` text PRIMARY KEY NOT NULL, `name_ar` text NOT NULL, `name_en` text NOT NULL, `description_ar` text NOT NULL, `description_en` text NOT NULL, `monthly_minor` integer DEFAULT 0 NOT NULL, `annual_minor` integer DEFAULT 0 NOT NULL, `wallet_limit` integer DEFAULT 1 NOT NULL, `member_limit` integer DEFAULT 2 NOT NULL, `features_json` text DEFAULT '[]' NOT NULL, `is_active` integer DEFAULT 1 NOT NULL, `sort_order` integer DEFAULT 0 NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `subscriptions` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `plan_id` text NOT NULL, `status` text DEFAULT 'trialing' NOT NULL, `billing_cycle` text DEFAULT 'monthly' NOT NULL, `current_period_start` text NOT NULL, `current_period_end` text NOT NULL, `cancel_at_period_end` integer DEFAULT 0 NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `invoices` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `subscription_id` text, `reference` text NOT NULL UNIQUE, `subtotal_minor` integer NOT NULL, `discount_minor` integer DEFAULT 0 NOT NULL, `tax_minor` integer DEFAULT 0 NOT NULL, `total_minor` integer NOT NULL, `currency` text DEFAULT 'OMR' NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `due_at` text NOT NULL, `paid_at` text, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `payments` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `invoice_id` text, `reference` text NOT NULL UNIQUE, `amount_minor` integer NOT NULL, `currency` text DEFAULT 'OMR' NOT NULL, `method` text DEFAULT 'bank_transfer' NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `settlement_status` text DEFAULT 'unsettled' NOT NULL, `occurred_at` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `coupons` (`id` text PRIMARY KEY NOT NULL, `code` text NOT NULL UNIQUE, `discount_type` text DEFAULT 'percent' NOT NULL, `value` integer NOT NULL, `usage_limit` integer DEFAULT 100 NOT NULL, `used_count` integer DEFAULT 0 NOT NULL, `expires_at` text, `is_active` integer DEFAULT 1 NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `documents` (`id` text PRIMARY KEY NOT NULL, `owner_user_id` text NOT NULL, `space_id` text, `type` text NOT NULL, `reference` text NOT NULL UNIQUE, `person_name` text NOT NULL, `description` text NOT NULL, `amount_minor` integer DEFAULT 0 NOT NULL, `currency` text DEFAULT 'OMR' NOT NULL, `status` text DEFAULT 'issued' NOT NULL, `payment_method` text DEFAULT 'bank_transfer' NOT NULL, `approved_by` text, `issued_at` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `document_sequences` (`key` text PRIMARY KEY NOT NULL, `next_value` integer DEFAULT 1 NOT NULL);
--> statement-breakpoint
CREATE TABLE `invites` (`id` text PRIMARY KEY NOT NULL, `space_id` text NOT NULL, `email` text NOT NULL, `role` text DEFAULT 'member' NOT NULL, `token` text NOT NULL UNIQUE, `status` text DEFAULT 'pending' NOT NULL, `expires_at` text NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `audit_logs` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `action` text NOT NULL, `entity_type` text NOT NULL, `entity_id` text NOT NULL, `metadata_json` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user_status` ON `subscriptions` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_user_created` ON `invoices` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_payments_status_date` ON `payments` (`status`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_documents_owner_date` ON `documents` (`owner_user_id`,`issued_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_date` ON `audit_logs` (`user_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
