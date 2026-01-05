CREATE TABLE `device_hostnames` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text NOT NULL,
	`hostname` text NOT NULL,
	`type` text DEFAULT 'A' NOT NULL,
	`source` text DEFAULT 'DISCOVERY' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_hostnames_org_host_idx` ON `device_hostnames` (`organization_id`,`hostname`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_hostnames_unique_idx` ON `device_hostnames` (`organization_id`,`device_id`,`hostname`,`type`);