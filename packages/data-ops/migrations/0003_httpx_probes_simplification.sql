-- Migration: Simplify httpx_probes schema and add idempotency constraint
-- Phase 6 Improvements: Move low-value fields to metadata JSON

-- Step 1: Add idempotency constraint to scan_artifacts
-- Prevents duplicate artifacts from Restate workflow retries
CREATE UNIQUE INDEX `scan_artifacts_idempotency_uq` ON `scan_artifacts` (`device_id`, `port`, `scan_run_id`, `tool_name`);

-- Step 2: Rebuild httpx_probes with simplified schema
-- Move headers, tls_version, content_length, final_url to metadata JSON
PRAGMA foreign_keys=OFF;

-- Create new table with simplified schema
CREATE TABLE `__new_httpx_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`scheme` text,
	`status_code` integer,
	`title` text,
	`screenshot` text,
	`response_time` integer,
	`web_server` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `scan_artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Migrate data: consolidate old columns into metadata JSON
INSERT INTO `__new_httpx_probes` (
	`id`,
	`artifact_id`,
	`scheme`,
	`status_code`,
	`title`,
	`screenshot`,
	`response_time`,
	`web_server`,
	`metadata`,
	`created_at`
)
SELECT
	`id`,
	`artifact_id`,
	`scheme`,
	`status_code`,
	`title`,
	`screenshot`,
	`response_time`,
	`web_server`,
	json_object(
		'headers', json(`headers`),
		'tlsVersion', `tls_version`,
		'contentLength', `content_length`,
		'finalUrl', `final_url`
	) AS `metadata`,
	`created_at`
FROM `httpx_probes`;

-- Drop old table and rename new one
DROP TABLE `httpx_probes`;
ALTER TABLE `__new_httpx_probes` RENAME TO `httpx_probes`;

PRAGMA foreign_keys=ON;

-- Recreate indexes
CREATE UNIQUE INDEX `httpx_probes_artifact_id_unique` ON `httpx_probes` (`artifact_id`);
CREATE INDEX `httpx_probes_artifact_idx` ON `httpx_probes` (`artifact_id`);
CREATE INDEX `httpx_probes_status_code_idx` ON `httpx_probes` (`status_code`);
