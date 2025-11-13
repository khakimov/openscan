# Legacy Alignment

> References: `legacy/app/back/footprint_app/scheduler/scheduler_controller.py`, `legacy/app/back/footprint_app/scheduler/models/{task.py,scan.py,active_task.py}`, `legacy/app/back/footprint_app/celery_app/periodic_tasks_low_frequency_scanner.py`.

| Capability | Legacy Implementation | Current Approach | Notes |
| --- | --- | --- | --- |
| Schedule storage | `Scan` model persisted interval + tenant (`scan.py#L1-L120`). | `scan_schedules` row with JSON interval config (`orchestration.ts#L48-L95`). | Both support per-device scoping; we add presets and audit metadata. |
| Concurrency limit | Count active Celery tasks per queue (`scheduler_controller.py#L70-L129`). | Org leases via `scan_schedule_leases` and `acquireScanSlot`. | Leases keep work inside our DB and avoid Celery worker state. |
| Failure auto-pause | `ScanController` flagged tasks after repeated failures (`scan_controller.py#L92-L166`). | Restate `handleFailure` + `autoPauseScanSchedule`. | Thresholds remain preset-specific (QUICK/3, STANDARD/5, THOROUGH/8). |
| Audit trail | Implicit via `ActiveTask` logs & admin history. | Explicit `scan_schedule_events` table populated on every mutation. | Easier to query for compliance reports. |
| Timer engine | Celery beat/worker combination. | Restate durable timers per schedule. | Eliminates drift caused by beat-worker disconnects. |

The refactor keeps successful legacy patterns—per-tenant isolation, concurrency gating, and failure backoff—while modernising execution with Restate and TypeScript-first persistence.
