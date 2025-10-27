CREATE TABLE `httpx_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`scheme` text,
	`status_code` integer,
	`title` text,
	`screenshot` text,
	`headers` text,
	`response_time` integer,
	`content_length` integer,
	`final_url` text,
	`tls_version` text,
	`web_server` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `scan_artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `httpx_probes_artifact_id_unique` ON `httpx_probes` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `httpx_probes_artifact_idx` ON `httpx_probes` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `httpx_probes_status_code_idx` ON `httpx_probes` (`status_code`);--> statement-breakpoint
CREATE TABLE `httpx_tech_detections` (
	`id` text PRIMARY KEY NOT NULL,
	`probe_id` text NOT NULL,
	`technology_id` text NOT NULL,
	`confidence` text,
	`version` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`probe_id`) REFERENCES `httpx_probes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technology_id`) REFERENCES `technologies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `httpx_tech_detections_probe_idx` ON `httpx_tech_detections` (`probe_id`);--> statement-breakpoint
CREATE INDEX `httpx_tech_detections_tech_idx` ON `httpx_tech_detections` (`technology_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `httpx_tech_detections_probe_tech_idx` ON `httpx_tech_detections` (`probe_id`,`technology_id`);--> statement-breakpoint
CREATE TABLE `scan_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_run_id` text NOT NULL,
	`device_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`port` integer,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_message` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_artifacts_scan_run_idx` ON `scan_artifacts` (`scan_run_id`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_device_idx` ON `scan_artifacts` (`device_id`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_org_idx` ON `scan_artifacts` (`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_device_org_idx` ON `scan_artifacts` (`device_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_status_idx` ON `scan_artifacts` (`status`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_tool_name_idx` ON `scan_artifacts` (`tool_name`);--> statement-breakpoint
CREATE INDEX `scan_artifacts_port_idx` ON `scan_artifacts` (`port`);--> statement-breakpoint
CREATE TABLE `technologies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `technologies_name_unique` ON `technologies` (`name`);--> statement-breakpoint
CREATE INDEX `technologies_name_idx` ON `technologies` (`name`);--> statement-breakpoint
CREATE INDEX `technologies_category_idx` ON `technologies` (`category`);