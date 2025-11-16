# Device Scan Scheduling

The scheduling system orchestrates recurring device scans using Restate durable timers while persisting long-term state inside the user application. This folder replaces the former `docs/SCHEDULE.md` monolith and groups the material by topic.

## Quick Links
- [Architecture](./architecture.md)
- [Data Model](./data-model.md)
- [Operations & Governance](./operations.md)
- [API Surface](./api.md)
- [UI Workflow](./ui.md)
- [Testing Strategy](./testing.md)
- [Observability](./observability.md)
- [Rollout & Open Items](./rollout.md)
- [Legacy Alignment](./legacy-alignment.md)

## Implementation Touchpoints
- `packages/data-ops/src/queries/scan-schedules.ts` — schedule CRUD, runtime updates, and audit trail helpers.
- `packages/data-ops/src/queries/scan-schedule-limits.ts` — org-level concurrency leases.
- `packages/data-ops/src/schema/orchestration.ts` — `scan_schedules`, `scan_schedule_events`, and lease tables.
- `apps/restate-worker/src/device-scanner-service.ts` — Restate Virtual Object implementing durable timers.
- `apps/user-application/src/server/notifications/change-detector` — consumes scheduled scans; useful reference for postback integration.

## Legacy References
- `legacy/app/back/footprint_app/scheduler/scheduler_controller.py` — legacy Celery scheduler orchestrating tasks, concurrency, and pausing.
- `legacy/app/back/footprint_app/scheduler/models/scan.py` & `active_task.py` — historical persistence model for schedules and active runs.

Each topical document cross-references both the new code and the relevant legacy patterns so reviewers can verify parity and understand divergence.
