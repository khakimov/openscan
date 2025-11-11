CREATE TABLE `organization_notification_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email_allowed_severities` text DEFAULT '["CRITICAL","HIGH"]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_notification_settings_organization_id_unique` ON `organization_notification_settings` (`organization_id`);--> statement-breakpoint
CREATE INDEX `org_notification_settings_org_idx` ON `organization_notification_settings` (`organization_id`);--> statement-breakpoint
-- Note: module column already added in migration 0009, skip duplicate
-- ALTER TABLE `notifications` ADD `module` text NOT NULL;--> statement-breakpoint
-- Note: is_active column already added in migration 0007, skip duplicate
-- ALTER TABLE `notifications` ADD `is_active` integer DEFAULT true NOT NULL;