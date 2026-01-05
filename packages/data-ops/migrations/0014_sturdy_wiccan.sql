CREATE TABLE `user_notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`email_allowed_severities` text,
	`muted_devices` text DEFAULT '[]',
	`telegram_enabled` integer DEFAULT false NOT NULL,
	`telegram_chat_id` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_notification_prefs_user_org_idx` ON `user_notification_preferences` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `user_notification_prefs_org_idx` ON `user_notification_preferences` (`organization_id`);