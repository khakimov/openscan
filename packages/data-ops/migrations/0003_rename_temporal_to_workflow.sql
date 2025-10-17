ALTER TABLE `scan_workflows` RENAME COLUMN "temporal_id" TO "workflow_id";--> statement-breakpoint
DROP INDEX `scan_workflows_org_temporal_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `scan_workflows_org_workflow_uq` ON `scan_workflows` (`organization_id`,`workflow_id`);--> statement-breakpoint
ALTER TABLE `scan_workflows` DROP COLUMN `temporal_run_id`;