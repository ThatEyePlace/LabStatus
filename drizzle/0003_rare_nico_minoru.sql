CREATE TABLE `job_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
