# Architecture

> References: `apps/restate-worker/src/device-scanner-service.ts#L1-L210`, `packages/data-ops/src/queries/scan-schedules.ts#L32-L198`, legacy `footprint_app/scheduler/scheduler_controller.py#L1-L210`.

The scheduling stack uses a split-brain model:

- **Restate Virtual Object (`DeviceScanner`)** owns all ephemeral control flow, durable timers, and retries. The implementation (see `device-scanner-service.ts`) stores only runtime state in Restate (`STATE_KEYS` map) and schedules the next timer before executing the current scan (`scheduleDeviceScan` handler, lines 72-122).
- **TanStack app** persists canonical data. Every schedule mutation invokes the TypeScript query helpers in `scan-schedules.ts` which insert/update `scan_schedules`, append audit events, and expose reconciliation queries.
- **HTTP bridge** between the two mirrors the legacy Celery controller: the worker acquires organization-wide leases, kicks off scans, and posts results back to the app.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       User Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  UI Layer    │  │ Server Fns   │  │  Database        │  │
│  │  (Schedule   │→ │  (Create/    │→ │  (scan_schedules)│  │
│  │   Config)    │  │   Update/    │  │                  │  │
│  │              │  │   Delete)    │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                           ↓                                  │
│                    POST to Restate                           │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    Restate Cloud Ingress                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Restate Worker                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          DeviceScanner (Virtual Object)                 │ │
│  │  • Stores config in runtime state                       │ │
│  │  • Schedules next run before executing                  │ │
│  │  • Acquires org lease via HTTP                          │ │
│  │  • Invokes port scanner + postback                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              PortScanner (Service)                      │ │
│  │   - Reuses existing port scan workflow                  │ │
│  │   - ctx.run() for durable execution                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│                     Postback to User App                     │
└─────────────────────────────────────────────────────────────┘
```

## Restate Virtual Object Pattern

- **Reschedule-First:** `scheduleDeviceScan` and `executeScan` both compute the next run and schedule it immediately (`device-scanner-service.ts#L93-L118` and `#L150-L190`). This mirrors the legacy `SchedulerController` behaviour where timers were queued before the Celery task executed.
- **State Isolation:** Each object is keyed by `scheduleId`, ensuring one VO per device schedule (`#L58-L71`). Legacy achieved similar isolation through the `Task` model keyed by tenant + scanner + task name (`scheduler_controller.py#L17-L64`).
- **Timer Cancellation:** `pauseSchedule`/`deleteSchedule` flow calls `ctx.cancel(invocationId)` to stop timers. The Next execution handle is persisted in VO state (`STATE_KEYS.NEXT_EXECUTION_ID` at `device-scanner-service.ts#L47`), enabling idempotent cancel just like legacy's `TaskController.stop_task` routine.

## Failure Handling Loop

- `executeScan` calls `classifyFailure` (defined near `device-scanner-service.ts#L260`) to decide between transient backoff vs. auto-pause. The TanStack side records the updated failure count via `updateScheduleRuntime` (`scan-schedules.ts#L170-L198`).
- Auto-pausing thresholds by preset (`AUTO_PAUSE_THRESHOLDS` constant, `device-scanner-service.ts#L110-L118`) replace the legacy `Task.failure_count` logic located in `footprint_app/scheduler/scan_controller.py#L40-L112`.

## Concurrency Handshake

- Before executing a scan the worker calls the REST endpoint that uses `acquireScanSlot` (`scan-schedule-limits.ts#L31-L86`). On success it stores the lease ID in Restate state (`STATE_KEYS.LEASE_ID`).
- Legacy implemented the same safeguard through the `ActiveTask` table and `SchedulerController.count_*` helpers, notably `count_port_scanner_running_tasks` (`scheduler_controller.py#L70-L126`).

## Why Restate Instead of Celery

The legacy stack relied on Celery beat + worker clusters and suffered from:
- orphaned tasks on worker restart,
- coarse-grained cron intervals, and
- duplicate scans when ack timeouts overlapped.
Restate durable timers guarantee once-only semantics and provide the runtime hooks (`ctx.defer`, `ctx.cancel`) that map cleanly onto our scheduling requirements while keeping the authoritative data in our existing database layer.
