# Operations & Governance

> References: `packages/data-ops/src/queries/scan-schedule-limits.ts#L31-L143`, `packages/data-ops/src/queries/scan-schedules.ts#L200-L368`, `apps/user-application/src/server/schedules.ts#L1-L412`, legacy `footprint_app/scheduler/scheduler_controller.py#L60-L210`, `footprint_app/scheduler/scan_controller.py#L40-L188`.

## Concurrency Control

- The user application enforces an organization-wide lease cap through `acquireScanSlot` (`scan-schedule-limits.ts#L47-L94`). Each lease carries a 30‑minute TTL (`LEASE_TTL_MS`) and is cleaned via `cleanupExpiredLeases`.
- Restate workers request a lease before running a scan; the lease ID is stored in VO state and released via `releaseScanSlot` when the postback completes (`scan-schedule-limits.ts#L96-L132`).
- Legacy Celery workers counted active tasks per queue (`SchedulerController.count_*`, `scheduler_controller.py#L70-L129`). Our lease table provides the same protection without requiring direct DB polling from workers.

## Pause / Resume / Auto-Pause

- Manual pause/resume flows call `pauseScanSchedule` / `resumeScanSchedule` and forward the request to Restate (`scan-schedules.ts#L200-L262`, server handlers at `schedules.ts#L310-L398`). Both DB and VO state change in lockstep.
- Automatic pausing triggered by failure thresholds uses `autoPauseScanSchedule` (`scan-schedules.ts#L264-L309`). The Restate worker increments `consecutiveFailures` and, once the preset threshold is exceeded, invokes this helper with a human-readable reason.
- Legacy parity: Celery’s `ScanController` marked `Task` as suspended by setting `is_running` false and `current_status` to `SCHEDULER_NO_DATA` while sending a notification (scan_controller.py#L92-L166). Auto-paused schedules mimic that experience via the audit event log.

## Reconciliation & Drift Repair

- `getSchedulesDueToRun` (`scan-schedules.ts#L311-L342`) supplies a nightly reconciliation job that scans for timers that should have fired but did not (e.g., if Restate lost state). The server replays `scheduleDeviceScan` for those rows.
- Legacy employed a similar reconciliation through `periodic_tasks_low_frequency_scanner.py#L13-L44`, which iterated tenants and resubmitted Celery tasks when gaps were detected.

## Authorization & Quotas

- Server functions gate all mutations behind `getCurrentOrganizationId` / `getCurrentUser` and ensure the target device belongs to the same org before delegating to data-ops (`schedules.ts#L245-L309`).
- Hard limits (e.g., max schedules per device, per-organization) are enforced inside the server layer before calling into queries, mirroring the older `SchedulerController.get_scheduled_plan_ready_tenants` guard rails.
- Audit events recorded for each action (`scan-schedules.ts#L232-L262`) double as a governance trail, replacing legacy `SchedulerHistory` entries.
