CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text,
	`vendor` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `applications_org_name_idx` ON `applications` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `device_ips` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text NOT NULL,
	`ip` text NOT NULL,
	`primary` integer DEFAULT 0 NOT NULL,
	`last_scanned` integer,
	`reverse_dns` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_ips_org_ip_idx` ON `device_ips` (`organization_id`,`ip`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_ips_device_ip_uq` ON `device_ips` (`organization_id`,`device_id`,`ip`);--> statement-breakpoint
CREATE TABLE `device_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_tags_org_tag_idx` ON `device_tags` (`organization_id`,`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_tags_unique_idx` ON `device_tags` (`organization_id`,`device_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`risk_level` text DEFAULT 'SECURE' NOT NULL,
	`is_billable` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'AVAILABLE' NOT NULL,
	`is_scanned` integer DEFAULT 0 NOT NULL,
	`responds_to_ping` integer DEFAULT 0 NOT NULL,
	`verification_status` text DEFAULT 'CANDIDATE' NOT NULL,
	`verified_at` integer,
	`verified_by` text,
	`verification_note` text,
	`notes` text,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `devices_org_billable_idx` ON `devices` (`organization_id`,`is_billable`);--> statement-breakpoint
CREATE INDEX `devices_org_risk_idx` ON `devices` (`organization_id`,`risk_level`);--> statement-breakpoint
CREATE INDEX `devices_org_state_idx` ON `devices` (`organization_id`,`state`);--> statement-breakpoint
CREATE INDEX `devices_org_verification_idx` ON `devices` (`organization_id`,`verification_status`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_org_name_uq` ON `tags` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `scanners` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'REGISTERING' NOT NULL,
	`capabilities` text,
	`last_heartbeat` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scanners_org_status_idx` ON `scanners` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `scan_run_devices` (
	`run_id` text NOT NULL,
	`device_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`metadata` text,
	PRIMARY KEY(`run_id`, `device_id`),
	FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_run_devices_org_idx` ON `scan_run_devices` (`organization_id`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`scope` text NOT NULL,
	`scan_type` text NOT NULL,
	`target` text,
	`requested_by_id` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`result_summary` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `scan_workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scan_runs_org_status_idx` ON `scan_runs` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `scan_runs_workflow_idx` ON `scan_runs` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `scan_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`device_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`interval` text DEFAULT '1h' NOT NULL,
	`is_active` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedules_schedule_id_unique` ON `scan_schedules` (`schedule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedules_device_id_unique` ON `scan_schedules` (`device_id`);--> statement-breakpoint
CREATE INDEX `scan_schedules_org_idx` ON `scan_schedules` (`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_schedules_device_idx` ON `scan_schedules` (`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_schedules_schedule_id_uq` ON `scan_schedules` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `scan_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`temporal_id` text NOT NULL,
	`temporal_run_id` text,
	`started_at` integer,
	`finished_at` integer,
	`cancel_requested_at` integer,
	`metadata` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_workflows_org_status_idx` ON `scan_workflows` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `scan_workflows_status_started_idx` ON `scan_workflows` (`status`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_workflows_org_temporal_uq` ON `scan_workflows` (`organization_id`,`temporal_id`);