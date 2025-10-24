DROP TABLE `scan_workflows`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`restate_workflow_id` text NOT NULL,
	`workflow_kind` text NOT NULL,
	`workflow_status` text DEFAULT 'PENDING' NOT NULL,
	`workflow_started_at` integer,
	`workflow_finished_at` integer,
	`workflow_cancel_requested_at` integer,
	`workflow_metadata` text,
	`scope` text NOT NULL,
	`scan_type` text NOT NULL,
	`target` text,
	`requested_by_id` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`result_summary` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_scan_runs`("id", "organization_id", "restate_workflow_id", "workflow_kind", "workflow_status", "workflow_started_at", "workflow_finished_at", "workflow_cancel_requested_at", "workflow_metadata", "scope", "scan_type", "target", "requested_by_id", "created_at", "started_at", "completed_at", "status", "result_summary") SELECT "id", "organization_id", "restate_workflow_id", "workflow_kind", "workflow_status", "workflow_started_at", "workflow_finished_at", "workflow_cancel_requested_at", "workflow_metadata", "scope", "scan_type", "target", "requested_by_id", "created_at", "started_at", "completed_at", "status", "result_summary" FROM `scan_runs`;--> statement-breakpoint
DROP TABLE `scan_runs`;--> statement-breakpoint
ALTER TABLE `__new_scan_runs` RENAME TO `scan_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `scan_runs_org_status_idx` ON `scan_runs` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_runs_org_restate_workflow_id_uq` ON `scan_runs` (`organization_id`,`restate_workflow_id`);