# Data Model

> References: `packages/data-ops/src/schema/orchestration.ts#L48-L128`, `packages/data-ops/src/queries/scan-schedules.ts#L32-L368`, `packages/data-ops/src/queries/scan-schedule-limits.ts#L31-L143`, legacy `footprint_app/scheduler/models/scan.py#L1-L140`, `footprint_app/scheduler/models/active_task.py#L1-L160`.

## Tables

### `scan_schedules`
- Defined in `orchestration.ts#L48-L95`.
- Stores canonical configuration (`intervalConfig`, `preset`), runtime markers (`nextRunAt`, `lastRunAt`, `status`, `consecutiveFailures`), and audit metadata (`createdBy`, `pausedBy`).
- All inserts/updates flow through the query helpers (`createScanSchedule`, `updateScheduleRuntime`, `pauseScanSchedule`, etc.) so retries remain idempotent.

### `scan_schedule_events`
- Schema: `orchestration.ts#L98-L118`.
- Event stream for audit purposes; records `CREATED`, `PAUSED`, `AUTO_PAUSED`, `RESUMED`, and `DELETED` states. Written exclusively via `recordScheduleEvent` (`scan-schedules.ts#L232-L264`).
- Replaces legacy `SchedulerHistory` table behaviour where Celery logged state transitions.

### `scan_schedule_leases`
- Schema: `orchestration.ts#L120-L128`.
- Each row represents an active concurrency lease acquired by `acquireScanSlot`. TTL enforcement and cleanup mirror `ActiveTask` rows in the legacy system, but scoped to organization rather than queue.

## Derived Data

- `formatIntervalLabel` keeps a cached human-readable label inside `scan_schedules.interval` for fast filtering (`scan-schedules.ts#L270-L302`).
- Organization-level counts leverage the same table to enforce quota limits (see `getSchedulesForOrganization`, `scan-schedules.ts#L142-L168`).

## Legacy Comparison

Legacy Django models split concerns across `Scan` (configuration) and `ActiveTask` (runtime), both tied to the `Task` catalog. We collapse those concepts into a single `scan_schedules` row per device, while leases provide a lightweight analogue to `ActiveTask` without requiring a heavy ORM layer.

Key parity checks:
- **Audit Trail:** Legacy `ActiveTask` invoked `NotificationsController.start_task`; we instead create explicit `scan_schedule_events` for downstream analytics.
- **Failure Counters:** Legacy stored counters on `Task`; we track `consecutiveFailures` directly on the schedule row so Restate can bump counts deterministically.
