CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`description` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`organization_id`);--> statement-breakpoint
CREATE INDEX `projects_org_default_idx` ON `projects` (`organization_id`,`is_default`);--> statement-breakpoint
ALTER TABLE `devices` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
CREATE INDEX `devices_org_project_idx` ON `devices` (`organization_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `devices_project_idx` ON `devices` (`project_id`);