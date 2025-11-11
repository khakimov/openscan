CREATE TABLE `scan_schedule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`performed_by` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `scan_schedules`(`schedule_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`performed_by`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scan_schedule_events_schedule_idx` ON `scan_schedule_events` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `scan_schedule_events_org_idx` ON `scan_schedule_events` (`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_schedule_events_type_idx` ON `scan_schedule_events` (`type`);--> statement-breakpoint
CREATE INDEX `scan_schedule_events_created_at_idx` ON `scan_schedule_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `scan_schedule_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`device_id` text NOT NULL,
	`preset` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `scan_schedules`(`schedule_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedule_leases_lease_id_unique` ON `scan_schedule_leases` (`lease_id`);--> statement-breakpoint
CREATE INDEX `scan_schedule_leases_org_idx` ON `scan_schedule_leases` (`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_schedule_leases_expires_at_idx` ON `scan_schedule_leases` (`expires_at`);--> statement-breakpoint
CREATE INDEX `scan_schedule_leases_schedule_idx` ON `scan_schedule_leases` (`schedule_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scan_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`device_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`interval_config` text NOT NULL,
	`interval` text DEFAULT '1d' NOT NULL,
	`preset` text DEFAULT 'STANDARD' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`last_run_status` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`paused_at` integer,
	`paused_by` text,
	`paused_reason` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`created_by` text,
	`updated_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paused_by`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_scan_schedules`("id", "schedule_id", "device_id", "organization_id", "interval_config", "interval", "preset", "is_active", "next_run_at", "last_run_at", "last_run_status", "consecutive_failures", "status", "paused_at", "paused_by", "paused_reason", "created_at", "created_by", "updated_at") SELECT "id", "schedule_id", "device_id", "organization_id", "interval_config", "interval", "preset", "is_active", "next_run_at", "last_run_at", "last_run_status", "consecutive_failures", "status", "paused_at", "paused_by", "paused_reason", "created_at", "created_by", "updated_at" FROM `scan_schedules`;--> statement-breakpoint
DROP TABLE `scan_schedules`;--> statement-breakpoint
ALTER TABLE `__new_scan_schedules` RENAME TO `scan_schedules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedules_schedule_id_unique` ON `scan_schedules` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `scan_schedules_org_idx` ON `scan_schedules` (`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_schedules_device_idx` ON `scan_schedules` (`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedules_schedule_id_uq` ON `scan_schedules` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `scan_schedules_next_run_idx` ON `scan_schedules` (`next_run_at`,`is_active`);--> statement-breakpoint
CREATE INDEX `scan_schedules_status_idx` ON `scan_schedules` (`status`);--> statement-breakpoint
-- Note: All httpx_probes schema changes already handled in migration 0003
-- These columns were already dropped/added in migration 0003, skip duplicates
-- ALTER TABLE `httpx_probes` ADD `metadata` text;--> statement-breakpoint
-- ALTER TABLE `httpx_probes` DROP COLUMN `headers`;--> statement-breakpoint
-- ALTER TABLE `httpx_probes` DROP COLUMN `content_length`;--> statement-breakpoint
-- ALTER TABLE `httpx_probes` DROP COLUMN `final_url`;--> statement-breakpoint
-- ALTER TABLE `httpx_probes` DROP COLUMN `tls_version`;--> statement-breakpoint
-- Note: scan_artifacts_idempotency_uq index already created in migration 0003
-- CREATE UNIQUE INDEX `scan_artifacts_idempotency_uq` ON `scan_artifacts` (`device_id`,`port`,`scan_run_id`,`tool_name`);