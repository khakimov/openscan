-- Note: This migration creates the notifications table from scratch
-- The INSERT...SELECT pattern was for schema changes but table doesn't exist yet
-- Skip data migration and just create the table fresh
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`device_id` text,
	`scan_run_id` text,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`message` text,
	`data` text,
	`fingerprint` text NOT NULL,
	`suppress_until` integer NOT NULL,
	`read_at` integer,
	`email_sent` integer DEFAULT false NOT NULL,
	`email_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_org_idx` ON `notifications` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notifications_device_idx` ON `notifications` (`device_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_dedup_idx` ON `notifications` (`organization_id`,`fingerprint`,`suppress_until`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`organization_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_email_pending_idx` ON `notifications` (`email_sent`,`severity`);--> statement-breakpoint
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);