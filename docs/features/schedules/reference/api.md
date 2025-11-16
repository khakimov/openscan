# API Surface

> References: `apps/user-application/src/server/schedules.ts#L1-L412`, `packages/data-ops/src/queries/scan-schedules.ts#L32-L342`, `apps/restate-worker/src/device-scanner-service.ts#L72-L330`, legacy `footprint_app/scheduler/task_controller.py#L30-L188`.

## Server Functions (TanStack App)

| Function | Path | Purpose | Notes |
| --- | --- | --- | --- |
| `createSchedule` | `schedules.ts#L245-L309` | Validates input, writes to DB via `createScanSchedule`, then calls Restate `scheduleDeviceScan`. | Mirrors legacy `TaskController.create_scheduled_task` logic. |
| `pauseSchedule` | `schedules.ts#L310-L351` | Pauses in DB and signals VO `pauseSchedule`. | Requires org-level auth check. |
| `resumeSchedule` | `schedules.ts#L352-L398` | Resets failure counters, schedules immediate next run. | Equivalent to legacy resume API. |
| `deleteSchedule` | `schedules.ts#L399-L412` | Marks schedule `DELETED` and cancels timer. | Soft delete; audit event recorded. |
| `listSchedulesForDevice` / `listSchedulesForOrg` | `schedules.ts` top section | Read helpers returning DB rows for UI tables. |

## Data-Ops Helpers

- `createScanSchedule`, `pauseScanSchedule`, `autoPauseScanSchedule`, etc. implement idempotent mutations (see `scan-schedules.ts`).
- Lease helpers (`acquireScanSlot`, `releaseScanSlot`, `extendScanLease`) expose a thin interface consumed by Restate.

## Restate Handlers

- `scheduleDeviceScan`, `executeScan`, `pauseSchedule`, `resumeSchedule`, `deleteSchedule`, `getScheduleState` inside `device-scanner-service.ts` mirror the server entry points.
- HTTP invocation paths follow the Restate convention: `POST /DeviceScanner/{scheduleId}/{handler}`.
- Response payloads are intentionally small (success + next run). All heavy data remains inside our DB.

## Legacy Comparison

Legacy Celery exposed similar RPC semantics through the `TaskController` class (`task_controller.py`), mapping HTTP calls to Celery tasks. The new implementation keeps the same separation of concerns—server functions orchestrate, workers execute—but swaps Celery queue RPCs for Restate object handlers.
