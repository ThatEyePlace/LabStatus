CREATE TABLE `email_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`encrypted_tokens` text NOT NULL,
	`mailbox` text NOT NULL,
	`connected_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_locks` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` integer,
	`type` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`provider_status` integer
);
--> statement-breakpoint
CREATE TABLE `email_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`encrypted_verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`type` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `customer_email` text DEFAULT '' NOT NULL;